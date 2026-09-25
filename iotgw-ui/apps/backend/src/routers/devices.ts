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
  DeviceNotFoundError,
  ensureDeviceSeed,
  getDeviceCode,
  rotateDeviceSeed,
} from "../services/device-code";
import {
  offboardHost,
  listActiveHosts,
  isPkiConfigured,
} from "../services/pki";
import {
  readConnectivityProgress,
  startConnectivityCheck,
  type ConnectivityRequest,
} from "../services/connectivity";
import type { SupabaseClient } from "@supabase/supabase-js";

// Kestra + edge-function endpoints for the force-re-enroll path (mirrors the
// deployments router; kept in sync deliberately — decision-020 FQDNs).
const KESTRA_API_URL = (
  process.env.KESTRA_API_URL ?? "http://kestra.kestra.svc.cluster.local:8080"
).replace(/\/+$/, "");
const SUPABASE_GATEWAY_URL = (
  process.env.SUPABASE_GATEWAY_URL ??
  "http://kong.supabase-app.svc.cluster.local:8000"
).replace(/\/+$/, "");

/** The device's VPN IP and its domain's pki-manager zone, for a connectivity check. */
async function resolveConnectivityTarget(
  supabase: SupabaseClient,
  deviceId: string,
): Promise<ConnectivityRequest> {
  const { data: device, error } = await supabase
    .from("devices")
    .select("id, name, ip_address, network:networks(domain:domains(pki_zone))")
    .eq("id", deviceId)
    .single();
  if (error || !device) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Device with ID ${deviceId} not found`, cause: error });
  }
  if (!device.ip_address) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Device has no IP address yet — it must be provisioned into its network first",
    });
  }
  const network = device.network as { domain?: { pki_zone?: string | null } | null } | null;
  return {
    targetIp: device.ip_address,
    deviceId: device.id,
    deviceName: device.name,
    pkiZone: network?.domain?.pki_zone ?? "",
  };
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

  // Reset a device's SSH-CA enrollment after a REINSTALL (decision-032,
  // task-128). ssh-ca only re-enrolls a device that proves possession of its
  // previously enrolled host key (task-075) — a reinstall destroys that key,
  // so the device could never enroll again. An operator, with a reason,
  // drops the stored continuity anchor (ssh_host_pubkey); the next enroll is
  // then accepted as a first one and re-keys the SAME pki-manager host (same
  // fqdn). Nothing is revoked or offboarded (offboard is terminal and would
  // burn the fqdn). If the old key may be COMPROMISED, delete and recreate the
  // device instead (that offboards).
  resetSshEnrollment: createMutationProcedure(
    "reset_ssh_enrollment",
    z.object({
      id: z.string(),
      reason: z.string().trim().min(3, "Give a reason (e.g. 'reinstalled')"),
    }),
    async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("devices")
        .update({ ssh_host_pubkey: null })
        .eq("id", input.id)
        .select("id, name, ssh_host_fqdn")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: error?.code === "PGRST116" ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
          message: error
            ? `Failed to reset SSH enrollment: ${error.message}`
            : `Device with ID ${input.id} not found`,
          cause: error,
        });
      }

      logger.warn(
        {
          deviceId: data.id,
          fqdn: data.ssh_host_fqdn,
          reason: input.reason,
        },
        "SSH enrollment RESET by an operator: the next enroll is accepted without proof of the previous host key",
      );
      return { reset: true, deviceId: data.id, fqdn: data.ssh_host_fqdn };
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

      // Node's global FormData: undici's fetch no longer serializes
      // formdata-node instances (sends text/plain → Kestra 415).
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

      // Create the device's one-time-code seed in Cosmian KMS (decision-033).
      // Best-effort like the SSH key below: getDeviceCode / the edge functions
      // create it lazily if this fails.
      try {
        await ensureDeviceSeed(supabase, data.id);
      } catch (error) {
        logger.error(
          { error, deviceId: data.id },
          "Device created but code seed creation failed; it will be created lazily",
        );
      }

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

  // Device one-time code (decision-033). The backend computes it from the
  // device's KMS-held seed; the browser never derives codes. Returns the next
  // step's code when the current one was already consumed for `vpn`.
  getDeviceCode: createQueryProcedure(
    "get_device_code",
    z.object({ id: z.string().min(1, "Device ID is required") }),
    async ({ ctx, input }) => {
      try {
        const code = await getDeviceCode(ctx.supabase, input.id);
        logger.info(
          { deviceId: input.id, step: code.step, next: code.next },
          "Issued device one-time code to the UI",
        );
        return code;
      } catch (error) {
        if (error instanceof DeviceNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.id} not found`,
          });
        }
        throw error;
      }
    },
  ),

  // "Reset code": rotate the device's seed (new KMS key, old one destroyed), so
  // every outstanding code dies, then return the new current code.
  rotateDeviceCode: createMutationProcedure(
    "rotate_device_code",
    z.object({ id: z.string().min(1, "Device ID is required") }),
    async ({ ctx, input }) => {
      try {
        await rotateDeviceSeed(ctx.supabase, input.id);
        const code = await getDeviceCode(ctx.supabase, input.id);
        logger.info(
          { deviceId: input.id, step: code.step },
          "Rotated device code seed and issued a new code to the UI",
        );
        return code;
      } catch (error) {
        if (error instanceof DeviceNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.id} not found`,
          });
        }
        throw error;
      }
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

  // Connectivity check (decision-030): start + progress so the UI can show
  // what is being waited for; checkDeviceConnectivity waits for the result.
  startDeviceConnectivityCheck: createMutationProcedure(
    "start_device_connectivity_check",
    z.object({ deviceId: z.string().min(1, "Device ID is required") }),
    async ({ ctx, input }) => {
      const target = await resolveConnectivityTarget(ctx.supabase, input.deviceId);
      const executionId = await startConnectivityCheck(target);
      logger.info(
        `Connectivity check for ${target.deviceName} (${target.targetIp}) started: ${executionId}`,
      );
      return { executionId, targetIp: target.targetIp };
    },
  ),

  getDeviceConnectivityCheck: createQueryProcedure(
    "get_device_connectivity_check",
    z.object({ executionId: z.string().min(1) }),
    async ({ input }) => readConnectivityProgress(input.executionId),
  ),

  checkDeviceConnectivity: createMutationProcedure(
    "check_device_connectivity",
    z.object({
      deviceId: z.string().min(1, "Device ID is required"),
    }),
    async ({ ctx, input }) => {
      const target = await resolveConnectivityTarget(ctx.supabase, input.deviceId);
      const executionId = await startConnectivityCheck(target);
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const progress = await readConnectivityProgress(executionId);
        if (progress.finished && progress.ping && progress.ansible) {
          return {
            success: progress.success ?? false,
            executionId,
            ping: progress.ping,
            ansible: progress.ansible,
          };
        }
      }
      const timeout = { success: false, error: "Timed out waiting for the connectivity-check execution", rawOutput: "" };
      return { success: false, executionId, ping: timeout, ansible: timeout };
    },
  ),
};
