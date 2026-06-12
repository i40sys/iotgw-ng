import { z } from "zod";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";

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

  generateMissingSshKey: createMutationProcedure(
    "generate_missing_ssh_key",
    z.object({
      device_id: z.string().min(1, "Device ID is required"),
      force: z.boolean().optional(),
    }),
    async ({ ctx, input }) => {
      // Trigger Kestra device flow to generate/update ssh_key_id when missing.
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

      const expectedKeyId = `device_ssh_${deviceData.id}`;
      // Format matches the Kestra workflow's expected input structure
      const requestBody = {
        type: "INSERT",
        table: "devices",
        record: {
          id: deviceData.id,
          name: deviceData.name,
          network_id: networkData.id,
        },
      };

      const kestraUrl =
        "http://wsl.ymbihq.local:8080/api/v1/main/executions/iotgw-ng/devices";

      logger.info(
        `Starting SSH key generation for device ${deviceData.id} via Kestra`,
      );

      const formData = new FormData();
      formData.append("json_data", JSON.stringify(requestBody));

      const response = await fetch(kestraUrl, {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`).toString("base64"),
        },
        body: formData as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText },
          "Kestra SSH key generation workflow failed to start",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to start SSH key generation: ${response.status} ${response.statusText}. Error: ${errorText}`,
        });
      }

      const executionData = await response.json();
      const executionId = executionData.id || "unknown";

      // Poll Kestra execution until completion (max 2 minutes)
      const maxWaitTime = 120000;
      const pollInterval = 2000;
      const startTime = Date.now();
      let finalState: string | null = null;

      while (Date.now() - startTime < maxWaitTime) {
        const statusUrl = `http://wsl.ymbihq.local:8080/api/v1/executions/${executionId}`;
        const statusResponse = await fetch(statusUrl, {
          method: "GET",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`).toString("base64"),
          },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          logger.warn(
            { status: statusResponse.status, error: errorText },
            "Failed to poll Kestra SSH key generation status",
          );
        } else {
          const statusData = await statusResponse.json();
          const state =
            statusData.state?.current?.toLowerCase() ||
            statusData.state?.toLowerCase();

          if (state) {
            finalState = state;
          }

          if (state === "success" || state === "failed" || state === "warning") {
            break;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      if (finalState !== "success") {
        logger.error(
          { executionId, finalState },
          "Kestra SSH key generation did not complete successfully",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            finalState === "failed" || finalState === "warning"
              ? `SSH key generation failed with status ${finalState}`
              : "SSH key generation timed out",
        });
      }

      const { data: updatedDevice, error: reloadError } = await supabase
        .from("devices")
        .select("ssh_key_id")
        .eq("id", deviceData.id)
        .single();

      if (reloadError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to reload device SSH key: ${reloadError.message}`,
          cause: reloadError,
        });
      }

      if (!updatedDevice?.ssh_key_id) {
        const { error: updateError } = await supabase
          .from("devices")
          .update({ ssh_key_id: expectedKeyId })
          .eq("id", deviceData.id);

        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update device SSH key: ${updateError.message}`,
            cause: updateError,
          });
        }

        return {
          status: "generated",
          sshKeyId: expectedKeyId,
          executionId,
        };
      }

      return {
        status: "generated",
        sshKeyId: updatedDevice.ssh_key_id,
        executionId,
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
      return data;
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

      logger.info(`Successfully deleted device with ID ${input.id}`);
      return data;
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

      // Step 2: Execute Kestra workflow for connectivity check
      try {
        const kestraUrl = "http://wsl.ymbihq.local:8080/api/v1/main/executions/iotgw-ng/connectivity-check";
        const requestBody = {
          target_ip: ipAddress,
          device_id: deviceData.id,
          device_name: deviceData.name,
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
          const statusUrl = `http://wsl.ymbihq.local:8080/api/v1/executions/${executionId}`;
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
