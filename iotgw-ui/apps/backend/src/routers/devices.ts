import { z } from "zod";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";
import {
  ensureDeviceSshKey,
  getDeviceSshPublicKey,
  destroyDeviceSshKey,
} from "../services/kms";
import {
  offboardHost,
  listActiveHosts,
  isPkiConfigured,
} from "../services/pki";

// Kestra + edge-function endpoints for the force-re-enroll path (mirrors the
// deployments router; kept in sync deliberately — decision-020 FQDNs).
const KESTRA_API_URL = (
  process.env.KESTRA_API_URL ?? "http://kestra.kestra.svc.cluster.local:8080"
).replace(/\/+$/, "");
const SUPABASE_GATEWAY_URL = (
  process.env.SUPABASE_GATEWAY_URL ??
  "http://kong.supabase-app.svc.cluster.local:8000"
).replace(/\/+$/, "");

// Debug logging for connectivity checks - enabled via LOG_LEVEL=debug environment variable
const isDebugEnabled = process.env.LOG_LEVEL === "debug";

function writeDebugLog(message: string) {
  if (isDebugEnabled) {
    logger.debug({ connectivity: true }, message);
  }
}

export const devicesRouter = {
  getDevices: createQueryProcedure(
    "get_devices",
    z.object({}).optional(),
    async ({ ctx }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select("*, network:networks(*)")
        .order("created_at", { ascending: false });

      if (error) {
        logger.error({ error }, "Error fetching devices from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch devices: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info("No devices found in database");
      } else {
        logger.info(`Successfully fetched ${data.length} devices`);
      }

      return data;
    },
  ),

  getDevicesByNetwork: createQueryProcedure(
    "get_devices_by_network",
    z.object({ network_id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select("*, network:networks(*)")
        .eq("network_id", input.network_id)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error(
          { error },
          "Error fetching devices by network from Supabase",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch devices for network: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info(`No devices found for network ID ${input.network_id}`);
      } else {
        logger.info(
          `Successfully fetched ${data.length} devices for network ID ${input.network_id}`,
        );
      }

      return data;
    },
  ),

  getDevice: createQueryProcedure(
    "get_device",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select("*, network:networks(*)")
        .eq("id", input.id)
        .single();

      if (error) {
        logger.error({ error }, "Error fetching device from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch device: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(`No device found with ID ${input.id}`);
      } else {
        logger.info(`Successfully fetched device with ID ${input.id}`);
      }

      return data;
    },
  ),

  checkSshKeyStatus: createQueryProcedure(
    "check_ssh_key_status",
    z.object({ device_id: z.string().min(1, "Device ID is required") }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select("ssh_key_id")
        .eq("id", input.device_id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.device_id} not found`,
            cause: error,
          });
        }

        logger.error({ error }, "Error fetching SSH key status from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch SSH key status: ${error.message}`,
          cause: error,
        });
      }

      return {
        hasSshKey: Boolean(data?.ssh_key_id),
        sshKeyId: data?.ssh_key_id ?? null,
      };
    },
  ),

  // Fetches the device's OpenSSH public key by round-tripping to Cosmian KMS —
  // proves the key materially exists there (not just that ssh_key_id is set in
  // the DB), and lets the UI display/export it.
  getDeviceSshPublicKey: createQueryProcedure(
    "get_device_ssh_public_key",
    z.object({ device_id: z.string().min(1, "Device ID is required") }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select("ssh_key_id")
        .eq("id", input.device_id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.device_id} not found`,
            cause: error,
          });
        }
        logger.error({ error }, "Error fetching device for SSH public key");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch device: ${error.message}`,
          cause: error,
        });
      }

      if (!data?.ssh_key_id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device ${input.device_id} has no SSH key`,
        });
      }

      const publicKey = await getDeviceSshPublicKey(data.ssh_key_id);
      return { sshKeyId: data.ssh_key_id, publicKey };
    },
  ),

  generateMissingSshKey: createMutationProcedure(
    "generate_missing_ssh_key",
    z.object({
      device_id: z.string().min(1, "Device ID is required"),
      force: z.boolean().optional(),
    }),
    async ({ ctx, input }) => {
      // Generate/repair the device's SSH key directly in Cosmian KMS
      // (decision-010). On-demand backfill + force-regenerate path; new devices
      // get a key automatically at creation time (see createDevice).
      const { supabase } = ctx;

      const { data: deviceData, error: deviceError } = await supabase
        .from("devices")
        .select("id, name, network_id, ssh_key_id")
        .eq("id", input.device_id)
        .single();

      if (deviceError || !deviceData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.device_id} not found`,
          cause: deviceError,
        });
      }

      if (deviceData.ssh_key_id && !input.force) {
        return {
          status: "exists",
          sshKeyId: deviceData.ssh_key_id,
        };
      }

      const { data: networkData, error: networkError } = await supabase
        .from("networks")
        .select("id, domain_id")
        .eq("id", deviceData.network_id)
        .single();

      if (networkError || !networkData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Network with ID ${deviceData.network_id} not found`,
          cause: networkError,
        });
      }

      const { data: domainData, error: domainError } = await supabase
        .from("domains")
        .select("id")
        .eq("id", networkData.domain_id)
        .single();

      if (domainError || !domainData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Domain with ID ${networkData.domain_id} not found`,
          cause: domainError,
        });
      }

      logger.info(
        `Generating SSH key for device ${deviceData.id} in Cosmian KMS`,
      );

      const { sshKeyId } = await ensureDeviceSshKey({
        deviceId: deviceData.id,
        networkId: networkData.id,
        domainId: domainData.id,
        force: input.force,
      });

      const { error: updateError } = await supabase
        .from("devices")
        .update({ ssh_key_id: sshKeyId })
        .eq("id", deviceData.id);

      if (updateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to persist SSH key id: ${updateError.message}`,
          cause: updateError,
        });
      }

      return {
        status: "generated",
        sshKeyId,
      };
    },
  ),

  // SSH-CA host-certificate enrollment status (task-081). Reads only the
  // enrollment metadata the `ssh-ca` edge function writes back on a successful
  // enroll — NEVER any private key material (AC#5; the host private key never
  // leaves the gateway and is not stored here at all).
  getSshCertStatus: createQueryProcedure(
    "get_ssh_cert_status",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("devices")
        .select(
          "ssh_host_id, ssh_host_fqdn, ssh_host_key_fingerprint, ssh_host_cert_serial, ssh_host_cert_valid_before, ssh_ca_enrolled_at",
        )
        .eq("id", input.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.id} not found`,
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to read SSH certificate status: ${error.message}`,
          cause: error,
        });
      }

      const validBefore = data?.ssh_host_cert_valid_before ?? null;
      const expiresInDays =
        validBefore !== null
          ? Math.floor(
              (new Date(validBefore).getTime() - Date.now()) / 86_400_000,
            )
          : null;

      return {
        enrolled: Boolean(data?.ssh_host_id),
        hostId: data?.ssh_host_id ?? null,
        fqdn: data?.ssh_host_fqdn ?? null,
        keyFingerprint: data?.ssh_host_key_fingerprint ?? null,
        certSerial: data?.ssh_host_cert_serial ?? null,
        certValidBefore: validBefore,
        enrolledAt: data?.ssh_ca_enrolled_at ?? null,
        expiresInDays,
        isExpired: expiresInDays !== null && expiresInDays < 0,
      };
    },
  ),

  // Force a re-enrollment of a device's SSH host certificate (task-081, AC#2).
  //
  // UNAMBIGUOUS MEANING: this QUEUES a re-enroll by triggering the Kestra
  // `provisioning` flow with `__tags__: ["ssh_ca"]` and `ssh_ca_force: true` for
  // this one device. It deliberately does NOT call the `ssh-ca` edge function:
  // that path is TOTP-authenticated *as the device* and the backend is not the
  // device; nor can the backend re-sign directly (it does not hold the gateway's
  // host public key — that lives on the gateway). The gateway generates/holds the
  // host key and the ssh_ca task drives the signing. Result: an execution id the
  // caller can watch; the edge function writes ssh_host_* back on success.
  enrollSshCa: createMutationProcedure(
    "enroll_ssh_ca",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data: device, error: deviceError } = await supabase
        .from("devices")
        .select("id, name, network_id, ip_address, ssh_key_id")
        .eq("id", input.id)
        .single();

      if (deviceError || !device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.id} not found`,
          cause: deviceError,
        });
      }

      const { data: network, error: networkError } = await supabase
        .from("networks")
        .select("id, domain_id")
        .eq("id", device.network_id)
        .single();

      if (networkError || !network) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Network for device ${input.id} not found`,
          cause: networkError,
        });
      }

      if (!device.ip_address) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Device has no IP address yet — it must be provisioned into its network before SSH-CA enrollment can reach it.",
        });
      }

      // Same ssh_ca vars the deployments router packs; the ssh_ca task derives
      // the device TOTP from these identifiers (never a secret here). ssh_ca_force
      // makes it a re-sign even if the current cert is still fresh.
      const jsonData = {
        target_ip: device.ip_address,
        ssh_key_id: device.ssh_key_id ?? "",
        iotgw_ssh_ca_base_url: SUPABASE_GATEWAY_URL,
        device_id: `${device.name}@${network.id.slice(0, 8)}`,
        device_uuid: device.id,
        network_id: network.id,
        domain_id: network.domain_id,
        ssh_ca_force: true,
        __tags__: ["ssh_ca"],
      };

      const FormData = (await import("formdata-node")).FormData;
      const formData = new FormData();
      formData.append("json_data", JSON.stringify(jsonData));

      const response = await fetch(
        `${KESTRA_API_URL}/api/v1/main/executions/iotgw-ng/provisioning`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(
                `${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`,
              ).toString("base64"),
          },
          body: formData as unknown as BodyInit,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to queue SSH-CA re-enrollment (Kestra ${response.status} ${response.statusText}): ${errorText}`,
        });
      }

      const execution = (await response.json()) as { id?: string };
      logger.info(
        { deviceId: input.id, executionId: execution.id },
        "Queued forced SSH-CA re-enrollment via provisioning flow",
      );

      return {
        status: "queued" as const,
        executionId: execution.id ?? "unknown",
      };
    },
  ),

  createDevice: createMutationProcedure(
    "create_device",
    z.object({
      network_id: z.string().min(1, "Network ID is required"),
      name: z.string().min(1, "Device name is required"),
      description: z.string().nullable().optional(),
      ip_address: z
        .string()
        .regex(
          /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$|^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
          "Invalid IP address format",
        )
        .nullable()
        .optional(),
      private_key: z.string().nullable().optional(),
      public_key: z.string().nullable().optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .insert({
          network_id: input.network_id,
          name: input.name,
          description: input.description ?? null,
          ip_address: input.ip_address ?? null,
          private_key: input.private_key ?? null,
          public_key: input.public_key ?? null,
        })
        .select("*, network:networks(*)")
        .single();

      if (error) {
        logger.error({ error }, "Error creating device");

        // Handle foreign key constraint violation for network_id
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Network with ID "${input.network_id}" does not exist`,
            cause: error,
          });
        }

        // Handle unique constraint violation for ip_address within network
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Device with IP address "${input.ip_address}" already exists in this network`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create device: ${error.message}`,
          cause: error,
        });
      }

      const ipInfo = input.ip_address ? ` with IP ${input.ip_address}` : "";
      logger.info(
        `Successfully created device "${input.name}"${ipInfo} in network ${input.network_id}`,
      );

      // Auto-generate the device's SSH key in Cosmian KMS (decision-010).
      // Best-effort: a KMS failure must not fail device creation — the device is
      // left without a key and can be repaired later via generateMissingSshKey.
      try {
        const network = (data as { network?: { domain_id?: string } | null })
          .network;
        const { sshKeyId } = await ensureDeviceSshKey({
          deviceId: data.id,
          networkId: data.network_id,
          domainId: network?.domain_id ?? undefined,
        });
        const { error: keyError } = await supabase
          .from("devices")
          .update({ ssh_key_id: sshKeyId })
          .eq("id", data.id);
        if (keyError) {
          logger.error(
            { error: keyError, deviceId: data.id },
            "Device created but failed to persist SSH key id",
          );
          return data;
        }
        return { ...data, ssh_key_id: sshKeyId };
      } catch (error) {
        logger.error(
          { error, deviceId: data.id },
          "Device created but SSH key generation failed; left without an SSH key",
        );
        return data;
      }
    },
  ),

  updateDevice: createMutationProcedure(
    "update_device",
    z.object({
      id: z.string(),
      network_id: z.string().min(1, "Network ID is required").optional(),
      name: z.string().min(1, "Device name is required").optional(),
      description: z.string().nullable().optional(),
      ip_address: z
        .string()
        .min(1, "IP address is required")
        .regex(
          /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$|^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
          "Invalid IP address format",
        )
        .optional(),
      private_key: z.string().nullable().optional(),
      public_key: z.string().nullable().optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // Build update object with only provided fields
      const updateData: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
      };

      if (input.network_id !== undefined) {
        updateData.network_id = input.network_id;
      }

      if (input.name !== undefined) {
        updateData.name = input.name;
      }

      if (input.description !== undefined) {
        updateData.description = input.description;
      }

      if (input.ip_address !== undefined) {
        updateData.ip_address = input.ip_address;
      }

      if (input.private_key !== undefined) {
        updateData.private_key = input.private_key;
      }

      if (input.public_key !== undefined) {
        updateData.public_key = input.public_key;
      }

      const { data, error } = await supabase
        .from("devices")
        .update(updateData)
        .eq("id", input.id)
        .select("*, network:networks(*)")
        .single();

      if (error) {
        logger.error({ error }, "Error updating device");

        // Handle foreign key constraint violation for network_id
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Network with ID "${input.network_id}" does not exist`,
            cause: error,
          });
        }

        // Handle unique constraint violation for ip_address within network
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Device with IP address "${input.ip_address}" already exists in this network`,
            cause: error,
          });
        }

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update device: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully updated device with ID ${input.id}`);
      return data;
    },
  ),

  getDevicesByDomain: createQueryProcedure(
    "get_devices_by_domain",
    z.object({ domain_id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .select(
          "*, network:networks(id, name, domain_id, domain:domains(id, name, display_name))",
        )
        .eq("network.domain_id", input.domain_id)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error(
          { error },
          "Error fetching devices by domain from Supabase",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch devices for domain: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info(`No devices found for domain ID ${input.domain_id}`);
      } else {
        logger.info(
          `Successfully fetched ${data.length} devices for domain ID ${input.domain_id}`,
        );
      }

      return data;
    },
  ),

  getDevicesFiltered: createQueryProcedure(
    "get_devices_filtered",
    z.object({
      domain_id: z.string().optional(),
      network_id: z.string().optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      let query = supabase
        .from("devices")
        .select(
          "*, network:networks(id, name, domain_id, domain:domains(id, name, display_name))",
        )
        .order("created_at", { ascending: false });

      if (input.network_id) {
        query = query.eq("network_id", input.network_id);
      } else if (input.domain_id) {
        query = query.eq("network.domain_id", input.domain_id);
      }

      const { data, error } = await query;

      if (error) {
        logger.error(
          { error },
          "Error fetching filtered devices from Supabase",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch filtered devices: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info("No devices found with applied filters");
      } else {
        logger.info(`Successfully fetched ${data.length} filtered devices`);
      }

      return data;
    },
  ),

  deleteDevice: createMutationProcedure(
    "delete_device",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("devices")
        .delete()
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error deleting device");

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete device: ${error.message}`,
          cause: error,
        });
      }

      // Best-effort: revoke+destroy the device's SSH key in Cosmian KMS so it
      // doesn't outlive the device. A KMS failure must not fail the delete.
      if (data?.ssh_key_id) {
        try {
          await destroyDeviceSshKey(data.ssh_key_id);
          logger.info({ keyId: data.ssh_key_id }, "Revoked device SSH key in KMS");
        } catch (err) {
          logger.error(
            { error: err, keyId: data.ssh_key_id },
            "Device deleted but failed to revoke its SSH key in KMS",
          );
        }
      }

      // MANDATORY offboard-on-delete (decision-028 §2/§10, task-102): Netmaker
      // recycles a deleted device's WireGuard IP immediately (observed), and that
      // IP is a host-certificate principal — so the old host cert would validate
      // for whoever next gets the IP unless it is revoked. Offboarding retires the
      // host's certs/KRL lineage. It is TERMINAL and cannot be undone. Logged as
      // an error on failure so the orphan check (checkSshHostOrphans) catches a
      // device deleted without a successful offboard; the delete itself is not
      // reverted (the row is already gone).
      if (data?.ssh_host_id && isPkiConfigured()) {
        try {
          await offboardHost(data.ssh_host_id);
          logger.info(
            { sshHostId: data.ssh_host_id, deviceId: input.id },
            "Offboarded device's pki-manager host (certs revoked, terminal)",
          );
        } catch (err) {
          logger.error(
            { error: err, sshHostId: data.ssh_host_id, deviceId: input.id },
            "ORPHANED SSH HOST: device deleted but pki-manager offboard FAILED — " +
              "its host cert may still validate for a recycled IP; run checkSshHostOrphans",
          );
        }
      }

      logger.info(`Successfully deleted device with ID ${input.id}`);
      return data;
    },
  ),

  // Orphan check (decision-028 §2, task-102): a pki-manager host that is still
  // active but has NO devices row pointing at it means a device was deleted
  // without a successful offboard — its host cert can still validate for a
  // recycled Netmaker IP. Returns those hosts so an operator (or a scheduled
  // job) can offboard them. Empty list = clean.
  checkSshHostOrphans: createQueryProcedure(
    "check_ssh_host_orphans",
    z.object({}).optional(),
    async ({ ctx }) => {
      const { supabase } = ctx;
      if (!isPkiConfigured()) {
        return { configured: false, orphans: [] as { id: string; fqdn: string }[] };
      }

      const [{ data: devices, error }, hosts] = await Promise.all([
        supabase.from("devices").select("ssh_host_id").not("ssh_host_id", "is", null),
        listActiveHosts(),
      ]);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to read devices for the orphan check: ${error.message}`,
          cause: error,
        });
      }

      const known = new Set(
        (devices ?? [])
          .map((d) => (d as { ssh_host_id: string | null }).ssh_host_id)
          .filter((v): v is string => Boolean(v)),
      );
      // Scope to iotgw-ng's own hosts by the `.iotgw` FQDN suffix (the edge
      // function's FQDN namespace) so other tenants of the shared pki-manager
      // (e.g. *.ymbihq.local, *.acme.example) are never flagged. An active
      // `.iotgw` host that no device references = deleted without offboard.
      const orphans = hosts
        .filter((h) => h.fqdn.endsWith(".iotgw") && !known.has(h.id))
        .map((h) => ({ id: h.id, fqdn: h.fqdn }));

      logger.info(
        { orphanCount: orphans.length },
        "checkSshHostOrphans: pki hosts with no device row (deleted-without-offboard)",
      );
      return { configured: true, orphans };
    },
  ),

  incrementTotpCounter: createMutationProcedure(
    "increment_totp_counter",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // First, get the current counter value and network info
      const { data: currentDevice, error: fetchError } = await supabase
        .from("devices")
        .select("totp_counter, network_id, network:networks(domain_id)")
        .eq("id", input.id)
        .single();

      if (fetchError) {
        logger.error({ error: fetchError }, "Error fetching device for TOTP");
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.id} not found`,
          cause: fetchError,
        });
      }

      const newCounter = (currentDevice.totp_counter ?? 0) + 1;

      // Increment the counter
      const { data, error } = await supabase
        .from("devices")
        .update({ totp_counter: newCounter })
        .eq("id", input.id)
        .select("*, network:networks(domain_id)")
        .single();

      if (error) {
        logger.error({ error }, "Error incrementing TOTP counter");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to increment TOTP counter: ${error.message}`,
          cause: error,
        });
      }

      logger.info(
        `Successfully incremented TOTP counter for device ${input.id} to ${newCounter}`,
      );
      return data;
    },
  ),

  // Device jobs query procedures
  listDeviceJobs: createQueryProcedure(
    "list_device_jobs",
    z.object({
      device_id: z.string().optional(),
      network_id: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc("get_device_jobs", {
        p_device_id: input.device_id ?? undefined,
        p_network_id: input.network_id ?? undefined,
        p_status: input.status ?? undefined,
        p_limit: input.limit ?? undefined,
        p_offset: input.offset ?? undefined,
      });

      if (error) {
        logger.error({ error }, "Error fetching device jobs");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch device jobs: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info("No device jobs found");
        return [];
      }

      logger.info(`Successfully fetched ${data.length} device jobs`);
      return data;
    },
  ),

  getDeviceJobByExecutionId: createQueryProcedure(
    "get_device_job_by_execution_id",
    z.object({
      execution_id: z.string().min(1, "Execution ID is required"),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc(
        "get_device_job_by_execution_id",
        {
          p_execution_id: input.execution_id,
        },
      );

      if (error) {
        logger.error({ error }, "Error fetching device job by execution ID");

        // P0002 is the error code from the RPC function when no record is found
        if (error.code === "P0002") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device job with execution ID ${input.execution_id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch device job: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device job with execution ID ${input.execution_id} not found`,
        });
      }

      logger.info(
        `Successfully fetched device job with execution ID ${input.execution_id}`,
      );
      return data[0];
    },
  ),

  checkDeviceConnectivity: createMutationProcedure(
    "check_device_connectivity",
    z.object({
      deviceId: z.string().min(1, "Device ID is required"),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // Clear debug log for new check
      writeDebugLog("=".repeat(80));
      writeDebugLog("NEW CONNECTIVITY CHECK STARTED");
      writeDebugLog(`Input deviceId: ${input.deviceId}`);

      // Step 1: Get device information
      writeDebugLog("Step 1: Fetching device information from Supabase...");
      const { data: deviceData, error: deviceError } = await supabase
        .from("devices")
        .select("id, name, ip_address, network_id")
        .eq("id", input.deviceId)
        .single();

      if (deviceError) {
        writeDebugLog(`ERROR: Failed to fetch device: ${JSON.stringify(deviceError)}`);
        logger.error({ error: deviceError }, "Error fetching device for connectivity check");
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.deviceId} not found`,
          cause: deviceError,
        });
      }

      writeDebugLog(`Device found: ${JSON.stringify(deviceData)}`);

      if (!deviceData.ip_address) {
        writeDebugLog("ERROR: Device has no IP address configured");
        logger.warn(`Device ${input.deviceId} has no IP address configured`);
        return {
          success: false,
          ping: {
            success: false,
            error: "Device has no IP address configured",
            rawOutput: "Error: No IP address configured for this device",
          },
          ansible: {
            success: false,
            error: "Cannot run ansible without IP address",
            rawOutput: "Error: Cannot run ansible check - no IP address configured",
          },
        };
      }

      const ipAddress = deviceData.ip_address;
      writeDebugLog(`IP Address: ${ipAddress}`);

      // Resolve the device's pki-manager zone (task-092) so the runner can mint
      // an iotgw-ops user cert the target gateway's User CA trusts. Best-effort:
      // an empty zone just means the runner falls back / the mint is skipped.
      let pkiZone = "";
      const { data: netRow } = await supabase
        .from("networks")
        .select("domain_id")
        .eq("id", deviceData.network_id)
        .single();
      if (netRow?.domain_id) {
        const { data: domRow } = await supabase
          .from("domains")
          .select("pki_zone")
          .eq("id", netRow.domain_id)
          .single();
        pkiZone = domRow?.pki_zone ?? "";
      }

      // Step 2: Execute Kestra workflow for connectivity check
      try {
        // Kestra is in its own namespace (decision-020); default to the
        // in-cluster FQDN, overridable via KESTRA_API_URL (set on the backend
        // Deployment). Scoped here; reused by the status poll below.
        const KESTRA_API_URL = (
          process.env.KESTRA_API_URL ?? "http://kestra.kestra.svc.cluster.local:8080"
        ).replace(/\/+$/, "");
        const kestraUrl = `${KESTRA_API_URL}/api/v1/main/executions/iotgw-ng/connectivity-check`;
        const requestBody = {
          target_ip: ipAddress,
          device_id: deviceData.id,
          device_name: deviceData.name,
          pki_zone: pkiZone,
        };

        writeDebugLog("Step 2: Calling Kestra workflow...");
        writeDebugLog(`Kestra URL: ${kestraUrl}`);
        writeDebugLog(`Request body: ${JSON.stringify(requestBody)}`);

        const formData = new FormData();
        formData.append("json_data", JSON.stringify(requestBody));

        logger.info(
          `Starting connectivity check for device ${deviceData.name} (${ipAddress})`,
        );

        writeDebugLog("Sending POST request to Kestra...");
        const response = await fetch(kestraUrl, {
          method: "POST",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`).toString("base64"),
          },
          body: formData as unknown as BodyInit,
        });

        writeDebugLog(`Kestra response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          writeDebugLog(`ERROR: Kestra request failed`);
          writeDebugLog(`Response body: ${errorText}`);
          logger.error(
            { status: response.status, error: errorText },
            "Kestra connectivity check workflow failed to start",
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to start connectivity check: ${response.status} ${response.statusText}. Error: ${errorText}`,
          });
        }

        const executionData = await response.json();
        writeDebugLog(`Kestra execution response: ${JSON.stringify(executionData)}`);
        const executionId = executionData.id;

        logger.info(
          `Kestra connectivity check started with execution ID: ${executionId}`,
        );
        writeDebugLog(`Execution ID: ${executionId}`);

        // Step 3: Poll for execution completion (with timeout)
        writeDebugLog("Step 3: Polling for execution completion...");
        const maxWaitTime = 30000; // 30 seconds
        const pollInterval = 1000; // 1 second
        const startTime = Date.now();
        let pollCount = 0;

        let pingResult = {
          success: false,
          error: "Timeout waiting for ping result",
          rawOutput: "",
          latency: undefined as number | undefined,
        };
        let ansibleResult = {
          success: false,
          error: "Timeout waiting for ansible result",
          rawOutput: "",
        };

        while (Date.now() - startTime < maxWaitTime) {
          pollCount++;
          const statusUrl = `${KESTRA_API_URL}/api/v1/executions/${executionId}`;
          writeDebugLog(`Poll #${pollCount}: GET ${statusUrl}`);

          const statusResponse = await fetch(statusUrl, {
            method: "GET",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(`${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`).toString("base64"),
            },
          });

          writeDebugLog(`Poll #${pollCount} response status: ${statusResponse.status}`);

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const state = statusData.state?.current?.toLowerCase() || statusData.state?.toLowerCase();
            writeDebugLog(`Poll #${pollCount} state: ${state}`);
            writeDebugLog(`Poll #${pollCount} full response: ${JSON.stringify(statusData)}`);

            if (state === "success" || state === "failed" || state === "warning") {
              // Extract results from task outputs (Kestra stores outputs per-task, not at execution level)
              const taskRunList = statusData.taskRunList || [];
              writeDebugLog(`Task run list count: ${taskRunList.length}`);

              // Find the icmp_ping task (SSH ping command)
              const icmpPingTask = taskRunList.find(
                (task: { taskId: string }) => task.taskId === "icmp_ping"
              );

              // Find the check_ansible_access task (Ansible ping module)
              const ansibleTask = taskRunList.find(
                (task: { taskId: string }) => task.taskId === "check_ansible_access"
              );

              writeDebugLog(`ICMP Ping task found: ${icmpPingTask ? "yes" : "no"}`);
              writeDebugLog(`Ansible task found: ${ansibleTask ? "yes" : "no"}`);

              // Parse ICMP ping result from icmp_ping task
              if (icmpPingTask) {
                writeDebugLog(`ICMP Ping task outputs: ${JSON.stringify(icmpPingTask.outputs)}`);
                writeDebugLog(`ICMP Ping task state: ${icmpPingTask.state?.current}`);
                writeDebugLog(`ICMP Ping task exitCode: ${icmpPingTask.outputs?.exitCode}`);

                // Check outputs.vars.outputs for the SSH ping command result
                if (icmpPingTask.outputs?.vars?.outputs && Array.isArray(icmpPingTask.outputs.vars.outputs)) {
                  const pingOutputs = icmpPingTask.outputs.vars.outputs;

                  // Find the SSH ping command result (has rc field and cmd containing "ping")
                  const sshPingResult = pingOutputs.find(
                    (out: { rc?: number; cmd?: string }) =>
                      out.rc !== undefined && out.cmd && out.cmd.includes("ping")
                  );

                  if (sshPingResult) {
                    const isSuccess = sshPingResult.rc === 0;
                    // Extract latency from stdout if available (e.g., "time=95.6 ms")
                    let latency: number | undefined;
                    if (sshPingResult.stdout) {
                      const latencyMatch = sshPingResult.stdout.match(/time[=<](\d+(?:\.\d+)?)\s*ms/);
                      if (latencyMatch) {
                        latency = parseFloat(latencyMatch[1]);
                      }
                    }

                    pingResult = {
                      success: isSuccess,
                      error: isSuccess ? "" : `Ping failed with rc=${sshPingResult.rc}`,
                      rawOutput: sshPingResult.stdout || sshPingResult.stderr || "",
                      latency,
                    };
                    writeDebugLog(`Parsed ping result: success=${isSuccess}, latency=${latency}`);
                  }
                }

                // Fallback: check exitCode at task level
                if (!pingResult.success && pingResult.error?.includes("Timeout")) {
                  if (icmpPingTask.outputs?.exitCode === 0 && icmpPingTask.state?.current === "SUCCESS") {
                    pingResult = {
                      success: true,
                      error: "",
                      rawOutput: JSON.stringify(icmpPingTask.outputs, null, 2),
                      latency: undefined,
                    };
                  }
                }
              }

              // Parse Ansible result from install_openwrt task
              if (ansibleTask) {
                writeDebugLog(`Ansible task outputs: ${JSON.stringify(ansibleTask.outputs)}`);
                writeDebugLog(`Ansible task state: ${ansibleTask.state?.current}`);
                writeDebugLog(`Ansible task exitCode: ${ansibleTask.outputs?.exitCode}`);

                // Check for exitCode: 0 AND state.current: "SUCCESS"
                const isSuccess =
                  ansibleTask.outputs?.exitCode === 0 &&
                  ansibleTask.state?.current === "SUCCESS";

                ansibleResult = {
                  success: isSuccess,
                  error: isSuccess ? "" : `Ansible failed: exitCode=${ansibleTask.outputs?.exitCode}, state=${ansibleTask.state?.current}`,
                  rawOutput: JSON.stringify(ansibleTask.outputs || {}, null, 2),
                };
                writeDebugLog(`Parsed ansible result: success=${isSuccess}`);
              }

              writeDebugLog(`Ping result: ${JSON.stringify(pingResult)}`);
              writeDebugLog(`Ansible result: ${JSON.stringify(ansibleResult)}`);

              logger.info(
                `Connectivity check completed for device ${deviceData.name}: ping=${pingResult.success}, ansible=${ansibleResult.success}`,
              );

              const finalResult = {
                success: pingResult.success && ansibleResult.success,
                executionId,
                ping: pingResult,
                ansible: ansibleResult,
              };
              writeDebugLog(`FINAL RESULT: ${JSON.stringify(finalResult)}`);
              writeDebugLog("=".repeat(80));

              return finalResult;
            }
          } else {
            const errorText = await statusResponse.text();
            writeDebugLog(`Poll #${pollCount} ERROR: ${errorText}`);
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        // Timeout reached
        writeDebugLog(`TIMEOUT: Connectivity check timed out after ${maxWaitTime}ms`);
        logger.warn(
          `Connectivity check timed out for device ${deviceData.name} after ${maxWaitTime}ms`,
        );

        const timeoutResult = {
          success: false,
          executionId,
          ping: pingResult,
          ansible: ansibleResult,
        };
        writeDebugLog(`TIMEOUT RESULT: ${JSON.stringify(timeoutResult)}`);
        writeDebugLog("=".repeat(80));

        return timeoutResult;
      } catch (error) {
        writeDebugLog(`EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
        writeDebugLog(`Stack: ${error instanceof Error ? error.stack : "N/A"}`);
        writeDebugLog("=".repeat(80));

        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({ error }, "Failed to execute connectivity check");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to execute connectivity check: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
        });
      }
    },
  ),
};
