import { z } from "zod";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";

// JSON schema matching the database Json type
const jsonSchema: z.ZodType<import("@iotgw/supabase-contract").Json> = z.lazy(
  () =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonSchema),
      z.record(jsonSchema),
    ]),
);

// Zod schemas for input validation
const createDeploymentSchema = z.object({
  name: z.string().min(1, "Deployment name is required"),
  description: z.string().nullable().optional(),
  device_id: z.string().nullable().optional(),
  configuration: jsonSchema.optional(),
  version: z.string().optional(),
  short: z.string().nullable().optional(),
});

const updateDeploymentSchema = z.object({
  id: z.string().min(1, "Deployment ID is required"),
  name: z.string().min(1, "Deployment name is required"),
  description: z.string().nullable().optional(),
  device_id: z.string().nullable().optional(),
  configuration: jsonSchema.optional(),
});

const getDeploymentSchema = z.object({
  id: z.string().min(1, "Deployment ID is required"),
});

const deleteDeploymentSchema = z.object({
  id: z.string().min(1, "Deployment ID is required"),
});

const listDeploymentsSchema = z.object({
  device_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const getDeploymentVersionsSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
});

// New schemas for deployment execution functionality
const executeDeploymentSchema = z.object({
  deployment_id: z.string().min(1, "Deployment ID is required"),
  device_id: z.string().min(1, "Device ID is required"),
});

const rollbackDeploymentSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  target_deployment_id: z.string().min(1, "Target deployment ID is required"),
});

const getDeploymentHistorySchema = z.object({
  device_id: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const checkDeviceConnectionSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
});

const validateConfigurationSchema = z.object({
  configuration: jsonSchema,
});

// Deployment jobs query schemas
const listDeploymentJobsSchema = z.object({
  device_id: z.string().optional(),
  deployment_id: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const getDeploymentJobSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
});

const getDeploymentJobByExecutionIdSchema = z.object({
  execution_id: z.string().min(1, "Execution ID is required"),
});

// Deployment status enum
const DeploymentStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  SUCCESS: "success",
  FAILED: "failed",
} as const;

type DeploymentStatusType =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

// Type definitions
export interface DeploymentHistoryEntry {
  id: string;
  deployment_id: string;
  device_id: string;
  status: string;
  message: string;
  progress: number;
  started_at: string;
  completed_at: string;
  executed_by: string;
  is_rollback: boolean;
}

export interface DeviceConnectionResult {
  isConnected: boolean;
  error?: string;
  latency?: number;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
}

interface ExecutionResult {
  status: string;
  progress: number;
  message: string;
  startedAt: string;
  completedAt: string;
}

type SupabaseClientType = SupabaseClient<Database>;

export const deploymentsRouter = {
  createDeployment: createMutationProcedure(
    "create_deployment",
    createDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      if (!input.device_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Device ID is required",
        });
      }

      const { data, error } = await supabase
        .from("deployments")
        .insert({
          name: input.name,
          description: input.description ?? null,
          device_id: input.device_id,
          configuration: input.configuration ?? {},
          version: input.version ?? "1",
          short: input.short ?? null,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error creating deployment configuration");

        // Handle specific error cases
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Device with ID "${input.device_id}" does not exist`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create deployment: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create deployment: No data returned",
        });
      }

      logger.info(
        `Successfully created deployment "${input.name}" with ID ${data.id}`,
      );

      return data;
    },
  ),

  listDeployments: createQueryProcedure(
    "list_deployments",
    listDeploymentsSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      let query = supabase.from("deployments").select("*");

      if (input.device_id) {
        query = query.eq("device_id", input.device_id);
      }

      if (input.search) {
        query = query.or(
          `name.ilike.%${input.search}%,description.ilike.%${input.search}%`,
        );
      }

      query = query.order("modified_at", { ascending: false });

      if (input.limit) {
        query = query.limit(input.limit);
      }

      if (input.offset) {
        query = query.range(input.offset, input.offset + (input.limit ?? 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, "Error fetching deployment configurations");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployments: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info("No deployment configurations found");
        return [];
      }

      logger.info(
        `Successfully fetched ${data.length} deployment configurations`,
      );
      return data;
    },
  ),

  getDeployment: createQueryProcedure(
    "get_deployment",
    getDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("deployments")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error) {
        logger.error({ error }, "Error fetching deployment configuration");

        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployment: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(`No deployment found with ID ${input.id}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment with ID ${input.id} not found`,
        });
      }

      logger.info(`Successfully fetched deployment with ID ${input.id}`);
      return data;
    },
  ),

  updateDeployment: createMutationProcedure(
    "update_deployment",
    updateDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("deployments")
        .update({
          name: input.name,
          description: input.description ?? undefined,
          device_id: input.device_id ?? undefined,
          configuration: input.configuration ?? {},
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error updating deployment configuration");

        // Handle specific error cases
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Device with ID "${input.device_id}" does not exist`,
            cause: error,
          });
        }

        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update deployment: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(`No deployment found with ID ${input.id} to update`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment with ID ${input.id} not found`,
        });
      }

      logger.info(`Successfully updated deployment with ID ${input.id}`);

      return data;
    },
  ),

  deleteDeployment: createMutationProcedure(
    "delete_deployment",
    deleteDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { error } = await supabase
        .from("deployments")
        .delete()
        .eq("id", input.id);

      if (error) {
        logger.error({ error }, "Error deleting deployment configuration");

        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete deployment: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully deleted deployment with ID ${input.id}`);
      return { success: true, id: input.id };
    },
  ),

  getDeploymentVersions: createQueryProcedure(
    "get_deployment_versions",
    getDeploymentVersionsSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("deployments")
        .select("*")
        .eq("device_id", input.device_id)
        .order("modified_at", { ascending: false });

      if (error) {
        logger.error({ error }, "Error fetching deployment versions");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployment versions: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(
          `No deployment versions found for device ${input.device_id}`,
        );
        return [];
      }

      logger.info(
        `Successfully fetched ${data.length} deployment versions for device ${input.device_id}`,
      );
      return data;
    },
  ),

  // Fetch Kestra execution logs
  fetchKestraExecutionLogs: createQueryProcedure(
    "fetch_kestra_execution_logs",
    z.object({
      execution_id: z.string().min(1, "Execution ID is required"),
    }),
    async ({ input }) => {
      try {
        logger.info(
          `Fetching Kestra execution logs for ID: ${input.execution_id}`,
        );

        // Fetch logs from Kestra
        const response = await fetch(
          `http://wsl.ymbihq.local:8080/api/v1/logs/${input.execution_id}`,
          {
            method: "GET",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from("oriol@joor.net:***REMOVED-ROTATED-KESTRA-PW***").toString("base64"),
            },
          },
        );

        if (!response.ok) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to fetch execution logs: ${response.status} ${response.statusText}`,
          });
        }

        const logs = await response.json();
        logger.info(
          `Fetched ${logs.length} log entries for execution ${input.execution_id}`,
        );

        // Filter for Ansible-specific logs (docker-java-stream threads)
        const ansibleLogs = logs.filter((log: any) =>
          log.thread?.startsWith("docker-java-stream"),
        );

        return {
          executionId: input.execution_id,
          logs: ansibleLogs,
          totalLogs: logs.length,
          ansibleLogs: ansibleLogs.length,
        };
      } catch (error) {
        logger.error({ error }, "Failed to fetch Kestra execution logs");

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch execution logs: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
        });
      }
    },
  ),

  // Check Kestra execution status
  checkKestraExecutionStatus: createQueryProcedure(
    "check_kestra_execution_status",
    z.object({
      execution_id: z.string().min(1, "Execution ID is required"),
      flow_id: z.string().optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      try {
        logger.info(
          `Checking Kestra execution status for ID: ${input.execution_id}`,
        );

        // Check execution status
        const response = await fetch(
          `http://wsl.ymbihq.local:8080/api/v1/executions/${input.execution_id}`,
          {
            method: "GET",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from("oriol@joor.net:***REMOVED-ROTATED-KESTRA-PW***").toString("base64"),
            },
          },
        );

        if (!response.ok) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to check execution status: ${response.status} ${response.statusText}`,
          });
        }

        const executionData = await response.json();

        // Map Kestra status to our status types
        let status: "RUNNING" | "SUCCESS" | "FAILED" | "PENDING" = "PENDING";
        if (executionData.state) {
          const kestraState =
            executionData.state.current?.toLowerCase() ||
            executionData.state.toLowerCase();
          if (kestraState === "running" || kestraState === "created") {
            status = "RUNNING";
          } else if (kestraState === "success") {
            status = "SUCCESS";
          } else if (
            kestraState === "failed" ||
            kestraState === "killed" ||
            kestraState === "warning"
          ) {
            status = "FAILED";
          }
        }

        const startedAt =
          executionData.state?.startDate ||
          executionData.startDate ||
          new Date().toISOString();
        const completedAt =
          executionData.state?.endDate ||
          executionData.endDate ||
          (status === "SUCCESS" || status === "FAILED"
            ? new Date().toISOString()
            : undefined);

        const errorMessage = executionData.state?.failedMessage || null;

        logger.info(`Kestra execution ${input.execution_id} status: ${status}`);

        // Update deployment job record when execution finishes (SUCCESS or FAILED)
        if ((status === "SUCCESS" || status === "FAILED") && completedAt) {
          const { error: updateError } = await supabase.rpc(
            "update_deployment_job_status",
            {
              p_execution_id: input.execution_id,
              p_status: status,
              p_completed_at: completedAt,
              p_error_message: errorMessage,
            },
          );

          if (updateError) {
            logger.error(
              { error: updateError },
              `Failed to update deployment job status for execution ${input.execution_id}`,
            );
            // Don't fail the status check if job update fails
          } else {
            logger.info(
              `Updated deployment job status to ${status} for execution ${input.execution_id}`,
            );
          }
        }

        return {
          executionId: input.execution_id,
          flowId: executionData.flowId || input.flow_id || "unknown",
          status,
          startedAt,
          completedAt,
          message:
            errorMessage ||
            (status === "SUCCESS"
              ? "Deployment completed successfully"
              : status === "FAILED"
                ? "Deployment failed"
                : "Deployment in progress"),
        };
      } catch (error) {
        logger.error({ error }, "Failed to check Kestra execution status");

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to check execution status: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
        });
      }
    },
  ),

  // Kestra execution schema
  executeKestraDeployment: createMutationProcedure(
    "execute_kestra_deployment",
    z.object({
      device_id: z.string().min(1, "Device ID is required"),
      deployment_id: z.string().min(1, "Deployment ID is required"),
      configuration: jsonSchema.optional(),
      flow_type: z.enum(["install", "provisioning"]).default("install"),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      try {
        logger.info(
          `Starting Kestra deployment for device ${input.device_id} with deployment ${input.deployment_id}`,
        );

        // Step 1: Fetch device record from database
        const { data: deviceData, error: deviceError } = await supabase
          .from("devices")
          .select("id, name, description, ip_address, network_id, ssh_key_id")
          .eq("id", input.device_id)
          .single();

        if (deviceError || !deviceData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Device with ID ${input.device_id} not found`,
            cause: deviceError,
          });
        }

        const deviceIpAddress = deviceData.ip_address;
        if (!deviceIpAddress) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Device ${input.device_id} does not have an IP address configured`,
          });
        }

        const sshKeyId = deviceData.ssh_key_id ?? null;
        if (!sshKeyId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Device ${input.device_id} does not have an SSH key configured. Please wait for key generation or regenerate.`,
          });
        }

        // Step 2: Fetch network record via device.network_id
        const { data: networkData, error: networkError } = await supabase
          .from("networks")
          .select("id, name, ipv4_cidr, ipv6_cidr, domain_id")
          .eq("id", deviceData.network_id)
          .single();

        if (networkError || !networkData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Network with ID ${deviceData.network_id} not found`,
            cause: networkError,
          });
        }

        // Step 3: Fetch domain record via network.domain_id
        const { data: domainData, error: domainError } = await supabase
          .from("domains")
          .select("id, name, display_name")
          .eq("id", networkData.domain_id)
          .single();

        if (domainError || !domainData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Domain with ID ${networkData.domain_id} not found`,
            cause: domainError,
          });
        }

        // Step 4: Fetch deployment record from deployments table
        const { data: deploymentData, error: deploymentError } = await supabase
          .from("deployments")
          .select("*")
          .eq("id", input.deployment_id)
          .single();

        if (deploymentError || !deploymentData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment with ID ${input.deployment_id} not found`,
            cause: deploymentError,
          });
        }

        // Import FormData for multipart/form-data
        const FormData = (await import("formdata-node")).FormData;

        // Create form data with the configuration JSON
        const formData = new FormData();
        const configToUse = input.configuration ?? deploymentData.configuration;

        // Add target_ip to the configuration for Kestra
        // This is only sent to Kestra and saved in deployment_jobs.configuration_json
        // It is NOT saved in the deployments table
        const configWithTargetIp =
          typeof configToUse === "object" && configToUse !== null
            ? {
                ...configToUse,
                target_ip: deviceIpAddress,
                ssh_key_id: sshKeyId,
              }
            : configToUse;

        if (configToUse) {
          formData.append("json_data", JSON.stringify(configWithTargetIp));
        }

        // Determine the Kestra flow URL based on flow_type
        const flowName = input.flow_type === "provisioning" ? "provisioning" : "install";
        const kestraUrl = `http://wsl.ymbihq.local:8080/api/v1/main/executions/iotgw-ng/${flowName}`;

        // Execute Kestra workflow with configuration input
        const response = await fetch(
          kestraUrl,
          {
            method: "POST",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from("oriol@joor.net:***REMOVED-ROTATED-KESTRA-PW***").toString("base64"),
            },
            body: formData as any,
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Kestra execution failed with status ${response.status}: ${response.statusText}. ${errorText}`,
          });
        }

        const executionData = await response.json();
        const executionId = executionData.id || "unknown";
        const flowId = executionData.flowId || `iotgw-ng/${flowName}`;
        const startTime = new Date().toISOString();

        logger.info(
          `Kestra execution started with ID: ${executionId}, flow: ${flowId}`,
        );

        // Step 5: Create deployment_jobs record with all denormalized snapshots
        const { error: jobError } = await supabase.rpc(
          "create_deployment_job",
          {
            p_execution_id: executionId,
            p_flow_id: flowId,
            p_status: "RUNNING",
            p_started_at: startTime,
            p_device_id: deviceData.id,
            p_device_name: deviceData.name,
            p_device_description: deviceData.description ?? "",
            p_device_ip_address: deviceIpAddress,
            p_network_id: networkData.id,
            p_network_name: networkData.name,
            p_network_cidr: "", // Legacy field, network now uses separate ipv4_cidr and ipv6_cidr
            p_network_ipv4: networkData.ipv4_cidr ?? "",
            p_network_ipv6: networkData.ipv6_cidr ?? "",
            p_domain_id: domainData.id,
            p_domain_name: domainData.name,
            p_domain_display_name: domainData.display_name,
            p_deployment_id: deploymentData.id,
            p_deployment_name: deploymentData.name,
            p_deployment_version: String(deploymentData.version),
            p_configuration_json: configWithTargetIp as any,
            p_ssh_key_id: sshKeyId,
          },
        );

        if (jobError) {
          logger.error(
            { error: jobError },
            `Failed to create deployment job record for execution ${executionId}`,
          );
          // Don't fail the entire operation if job creation fails
          // The Kestra execution has already started
        } else {
          logger.info(
            `Created deployment job record for execution ${executionId}`,
          );
        }

        return {
          success: true,
          executionId,
          flowId,
          status: "RUNNING",
          startedAt: startTime,
          message: "Deployment started successfully",
        };
      } catch (error) {
        logger.error({ error }, "Kestra deployment execution failed");

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to execute Kestra deployment: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
        });
      }
    },
  ),

  // New deployment execution procedures
  executeDeployment: createMutationProcedure(
    "execute_deployment",
    executeDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      try {
        // Step 1: Validate the deployment configuration exists
        const { data: deployment, error: deploymentError } = await supabase
          .from("deployments")
          .select("*")
          .eq("id", input.deployment_id)
          .single();

        if (deploymentError) {
          if (deploymentError.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Deployment with ID ${input.deployment_id} not found`,
              cause: deploymentError,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to fetch deployment: ${deploymentError.message}`,
            cause: deploymentError,
          });
        }

        if (!deployment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment with ID ${input.deployment_id} not found`,
          });
        }

        // Step 2: Check device connection
        const deviceConnectionResult = await checkDeviceConnectionInternal(
          supabase,
          input.device_id,
        );
        if (!deviceConnectionResult.isConnected) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Device ${input.device_id} is not reachable: ${deviceConnectionResult.error}`,
          });
        }

        // Step 3: Validate configuration
        const configurationValidationResult = validateConfigurationInternal(
          deployment.configuration,
        );
        if (!configurationValidationResult.isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Configuration validation failed: ${configurationValidationResult.errors.join(", ")}`,
          });
        }

        logger.info(
          `Starting deployment execution for deployment ${input.deployment_id} on device ${input.device_id}`,
        );

        // Step 4: Execute the deployment (simulated for now - in real implementation this would interact with the device)
        const executionResult = await executeDeploymentInternal(supabase, {
          deploymentId: input.deployment_id,
          deviceId: input.device_id,
          configuration: deployment.configuration,
        });

        logger.info(
          `Deployment execution completed with status: ${executionResult.status}`,
        );

        return {
          deploymentId: input.deployment_id,
          deviceId: input.device_id,
          status: executionResult.status as DeploymentStatusType,
          progress: executionResult.progress,
          message: executionResult.message,
          startedAt: executionResult.startedAt,
          completedAt: executionResult.completedAt,
        };
      } catch (error) {
        logger.error(
          { error },
          `Deployment execution failed for deployment ${input.deployment_id}`,
        );

        // Log the failure in deployment history
        logDeploymentHistory(supabase, {
          deploymentId: input.deployment_id,
          deviceId: input.device_id,
          status: DeploymentStatus.FAILED,
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        });

        throw error;
      }
    },
  ),

  rollbackDeployment: createMutationProcedure(
    "rollback_deployment",
    rollbackDeploymentSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      try {
        // Step 1: Validate the target deployment exists
        const { data: targetDeployment, error: targetDeploymentError } =
          await supabase
            .from("deployments")
            .select("*")
            .eq("id", input.target_deployment_id)
            .single();

        if (targetDeploymentError) {
          if (targetDeploymentError.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Target deployment with ID ${input.target_deployment_id} not found`,
              cause: targetDeploymentError,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to fetch target deployment: ${targetDeploymentError.message}`,
            cause: targetDeploymentError,
          });
        }

        if (!targetDeployment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Target deployment with ID ${input.target_deployment_id} not found`,
          });
        }

        // Step 2: Check device connection
        const deviceConnectionResult = await checkDeviceConnectionInternal(
          supabase,
          input.device_id,
        );
        if (!deviceConnectionResult.isConnected) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Device ${input.device_id} is not reachable: ${deviceConnectionResult.error}`,
          });
        }

        logger.info(
          `Starting rollback to deployment ${input.target_deployment_id} on device ${input.device_id}`,
        );

        // Step 3: Execute the rollback (reuse the deployment execution logic)
        const rollbackResult = await executeDeploymentInternal(supabase, {
          deploymentId: input.target_deployment_id,
          deviceId: input.device_id,
          configuration: targetDeployment.configuration,
          isRollback: true,
        });

        logger.info(`Rollback completed with status: ${rollbackResult.status}`);

        return {
          deploymentId: input.target_deployment_id,
          deviceId: input.device_id,
          status: rollbackResult.status as DeploymentStatusType,
          progress: rollbackResult.progress,
          message: `Rolled back to deployment: ${targetDeployment.name}`,
          startedAt: rollbackResult.startedAt,
          completedAt: rollbackResult.completedAt,
        };
      } catch (error) {
        logger.error(
          { error },
          `Rollback failed for device ${input.device_id}`,
        );

        // Log the rollback failure
        logDeploymentHistory(supabase, {
          deploymentId: input.target_deployment_id,
          deviceId: input.device_id,
          status: DeploymentStatus.FAILED,
          message: `Rollback failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          isRollback: true,
        });

        throw error;
      }
    },
  ),

  getDeploymentHistory: createQueryProcedure(
    "get_deployment_history",
    getDeploymentHistorySchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // For now, return a simulated history - in a real implementation,
      // this would query a deployment_history table
      const history = getDeploymentHistoryInternal(supabase, input);

      logger.info(
        `Successfully fetched deployment history with ${history.length} entries`,
      );
      return history;
    },
  ),

  checkDeviceConnection: createQueryProcedure(
    "check_device_connection",
    checkDeviceConnectionSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const result = await checkDeviceConnectionInternal(
        supabase,
        input.device_id,
      );

      logger.info(
        `Device connection check for ${input.device_id}: ${result.isConnected ? "connected" : "failed"}`,
      );
      return result;
    },
  ),

  validateConfiguration: createQueryProcedure(
    "validate_configuration",
    validateConfigurationSchema,
    async ({ input }) => {
      const result = validateConfigurationInternal(input.configuration);

      logger.info(
        `Configuration validation: ${result.isValid ? "valid" : "invalid"}`,
      );
      return result;
    },
  ),

  // Deployment jobs query procedures
  listDeploymentJobs: createQueryProcedure(
    "list_deployment_jobs",
    listDeploymentJobsSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc("get_deployment_jobs", {
        p_device_id: input.device_id ?? undefined,
        p_status: input.status ?? undefined,
        p_limit: input.limit ?? undefined,
        p_offset: input.offset ?? undefined,
      });

      if (error) {
        logger.error({ error }, "Error fetching deployment jobs");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployment jobs: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info("No deployment jobs found");
        return [];
      }

      logger.info(`Successfully fetched ${data.length} deployment jobs`);
      return data;
    },
  ),

  getDeploymentJob: createQueryProcedure(
    "get_deployment_job",
    getDeploymentJobSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("deployment_jobs")
        .select("*")
        .eq("id", input.job_id)
        .single();

      if (error) {
        logger.error({ error }, "Error fetching deployment job");

        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment job with ID ${input.job_id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployment job: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment job with ID ${input.job_id} not found`,
        });
      }

      logger.info(
        `Successfully fetched deployment job with ID ${input.job_id}`,
      );
      return data;
    },
  ),

  getDeploymentJobByExecutionId: createQueryProcedure(
    "get_deployment_job_by_execution_id",
    getDeploymentJobByExecutionIdSchema,
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc(
        "get_deployment_job_by_execution_id",
        {
          p_execution_id: input.execution_id,
        },
      );

      if (error) {
        logger.error(
          { error },
          "Error fetching deployment job by execution ID",
        );

        // P0002 is the error code from the RPC function when no record is found
        if (error.code === "P0002") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Deployment job with execution ID ${input.execution_id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch deployment job: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment job with execution ID ${input.execution_id} not found`,
        });
      }

      logger.info(
        `Successfully fetched deployment job with execution ID ${input.execution_id}`,
      );
      return data[0];
    },
  ),
};

/**
 * Internal helper function to check device connectivity
 */
async function checkDeviceConnectionInternal(
  supabase: SupabaseClientType,
  deviceId: string,
): Promise<DeviceConnectionResult> {
  try {
    // Get device information
    const { data: deviceData, error: deviceError } = await supabase
      .from("devices")
      .select("ip_address, name")
      .eq("id", deviceId)
      .single();

    if (deviceError) {
      return {
        isConnected: false,
        error: `Device not found: ${deviceError.message}`,
      };
    }

    if (!deviceData) {
      return {
        isConnected: false,
        error: "Device not found",
      };
    }

    // In a real implementation, this would perform an actual network connectivity test
    // For now, we'll simulate based on the device IP format
    const ipAddress = deviceData.ip_address;

    if (!ipAddress) {
      return {
        isConnected: false,
        error: "Device does not have an IP address configured",
      };
    }

    // Simple simulation: consider devices with valid IP addresses as connected
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const isValidIp = ipRegex.test(ipAddress);

    if (!isValidIp) {
      return {
        isConnected: false,
        error: "Invalid IP address format",
      };
    }

    // Simulate network latency
    const simulatedLatency = Math.floor(Math.random() * 100) + 10; // 10-110ms

    return {
      isConnected: true,
      latency: simulatedLatency,
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Internal helper function to validate deployment configuration
 */
function validateConfigurationInternal(
  configuration: unknown,
): ConfigurationValidationResult {
  const errors: string[] = [];

  // Basic validation rules
  if (!configuration) {
    errors.push("Configuration is required");
    return { isValid: false, errors };
  }

  if (typeof configuration !== "object") {
    errors.push("Configuration must be an object");
    return { isValid: false, errors };
  }

  // Add more specific validation rules as needed
  // For example, check for required fields, validate data types, etc.

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Internal helper function to execute deployment
 */
async function executeDeploymentInternal(
  supabase: SupabaseClientType,
  params: {
    deploymentId: string;
    deviceId: string;
    configuration: unknown;
    isRollback?: boolean;
  },
): Promise<ExecutionResult> {
  const startTime = new Date().toISOString();

  try {
    // Log the start of deployment
    logDeploymentHistory(supabase, {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: DeploymentStatus.PENDING,
      message: params.isRollback ? "Starting rollback" : "Starting deployment",
      isRollback: params.isRollback,
    });

    // Simulate deployment steps
    logDeploymentHistory(supabase, {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: DeploymentStatus.IN_PROGRESS,
      message: "Pushing configuration to device",
      progress: 30,
    });

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logDeploymentHistory(supabase, {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: DeploymentStatus.IN_PROGRESS,
      message: "Validating deployment on device",
      progress: 70,
    });

    // Simulate more processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    const completionTime = new Date().toISOString();

    // Complete the deployment
    logDeploymentHistory(supabase, {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: DeploymentStatus.SUCCESS,
      message: params.isRollback
        ? "Rollback completed successfully"
        : "Deployment completed successfully",
      progress: 100,
    });

    return {
      status: DeploymentStatus.SUCCESS,
      progress: 100,
      message: params.isRollback
        ? "Rollback completed successfully"
        : "Deployment completed successfully",
      startedAt: startTime,
      completedAt: completionTime,
    };
  } catch (error) {
    const completionTime = new Date().toISOString();
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    logDeploymentHistory(supabase, {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: DeploymentStatus.FAILED,
      message: `Deployment failed: ${errorMessage}`,
      progress: 0,
    });

    return {
      status: DeploymentStatus.FAILED,
      progress: 0,
      message: `Deployment failed: ${errorMessage}`,
      startedAt: startTime,
      completedAt: completionTime,
    };
  }
}

/**
 * Internal helper function to log deployment history
 */
function logDeploymentHistory(
  _supabase: SupabaseClientType,
  params: {
    deploymentId: string;
    deviceId: string;
    status: string;
    message: string;
    progress?: number;
    isRollback?: boolean;
  },
): void {
  // In a real implementation, this would insert into a deployment_history table
  // For now, we'll just log it
  logger.info(
    {
      deploymentId: params.deploymentId,
      deviceId: params.deviceId,
      status: params.status,
      message: params.message,
      progress: params.progress ?? 0,
      isRollback: params.isRollback ?? false,
      timestamp: new Date().toISOString(),
    },
    "Deployment history entry",
  );
}

/**
 * Internal helper function to get deployment history
 */
function getDeploymentHistoryInternal(
  _supabase: SupabaseClientType,
  input: {
    device_id?: string;
    limit?: number;
    offset?: number;
  },
): DeploymentHistoryEntry[] {
  // In a real implementation, this would query from a deployment_history table
  // For now, return a simulated history
  return [
    {
      id: "hist-1",
      deployment_id: "deployment-1",
      device_id: input.device_id ?? "device-1",
      status: "success",
      message: "Deployment completed successfully",
      progress: 100,
      started_at: "2024-01-01T10:00:00Z",
      completed_at: "2024-01-01T10:05:00Z",
      executed_by: "user-1",
      is_rollback: false,
    },
    {
      id: "hist-2",
      deployment_id: "deployment-2",
      device_id: input.device_id ?? "device-1",
      status: "failed",
      message: "Deployment failed: Connection timeout",
      progress: 50,
      started_at: "2024-01-01T09:00:00Z",
      completed_at: "2024-01-01T09:02:00Z",
      executed_by: "user-1",
      is_rollback: false,
    },
  ].slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 10));
}
