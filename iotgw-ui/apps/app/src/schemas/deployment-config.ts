import { z } from "zod";

// Zod schema for validation - flexible schema for any type of deployment
export const deploymentConfigSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    version: z.string().min(1, "Version is required"),
    // Services are optional since you may use Ansible or other deployment methods
    services: z
      .array(
        z.object({
          name: z.string(),
          image: z.string().optional(),
          ports: z
            .array(
              z.object({
                container: z.number(),
                host: z.number().optional(),
                protocol: z.enum(["tcp", "udp"]).optional(),
              }),
            )
            .optional(),
          environment: z.record(z.string()).optional(),
          volumes: z
            .array(
              z.object({
                source: z.string(),
                target: z.string(),
                type: z.enum(["bind", "volume", "tmpfs"]).optional(),
              }),
            )
            .optional(),
          healthCheck: z
            .object({
              test: z.union([z.string(), z.array(z.string())]),
              interval: z.string().optional(),
              timeout: z.string().optional(),
              retries: z.number().optional(),
              startPeriod: z.string().optional(),
            })
            .optional(),
        }),
      )
      .optional(), // Make services optional
    networks: z
      .array(
        z.object({
          name: z.string(),
          driver: z.string().optional(),
          external: z.boolean().optional(),
        }),
      )
      .optional(),
    volumes: z
      .array(
        z.object({
          name: z.string(),
          driver: z.string().optional(),
          external: z.boolean().optional(),
        }),
      )
      .optional(),
    resources: z
      .object({
        cpu: z.string().optional(),
        memory: z.string().optional(),
        limits: z
          .object({
            cpu: z.string().optional(),
            memory: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    secrets: z
      .array(
        z.object({
          name: z.string(),
          value: z.string().optional(),
          external: z.boolean().optional(),
        }),
      )
      .optional(),
    metadata: z.record(z.any()).optional(), // Allow any metadata
    // Allow any additional properties for flexibility with Ansible or other tools
  })
  .passthrough(); // Allow additional properties not defined in the schema

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

// JSON Schema for Monaco Editor validation
export const deploymentConfigJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  title: "Deployment Configuration",
  description: "Configuration schema for IoT Gateway deployments",
  required: ["name", "version"], // Only name and version are required
  properties: {
    name: {
      type: "string",
      description: "Deployment name",
      minLength: 1,
    },
    version: {
      type: "string",
      description: "Deployment version",
      minLength: 1,
    },
    services: {
      type: "array",
      description: "List of services to deploy (optional)",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Service name",
          },
          image: {
            type: "string",
            description: "Container image",
          },
          ports: {
            type: "array",
            description: "Port mappings",
            items: {
              type: "object",
              required: ["container"],
              properties: {
                container: {
                  type: "number",
                  description: "Container port",
                },
                host: {
                  type: "number",
                  description: "Host port",
                },
                protocol: {
                  type: "string",
                  description: "Protocol",
                  enum: ["tcp", "udp"],
                },
              },
            },
          },
          environment: {
            type: "object",
            description: "Environment variables",
            additionalProperties: {
              type: "string",
            },
          },
          volumes: {
            type: "array",
            description: "Volume mounts",
            items: {
              type: "object",
              required: ["source", "target"],
              properties: {
                source: {
                  type: "string",
                  description: "Source path",
                },
                target: {
                  type: "string",
                  description: "Target path",
                },
                type: {
                  type: "string",
                  description: "Volume type",
                  enum: ["bind", "volume", "tmpfs"],
                },
              },
            },
          },
          healthCheck: {
            type: "object",
            description: "Health check configuration",
            required: ["test"],
            properties: {
              test: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                ],
                description: "Health check command",
              },
              interval: {
                type: "string",
                description: "Check interval",
              },
              timeout: {
                type: "string",
                description: "Check timeout",
              },
              retries: {
                type: "number",
                description: "Number of retries",
              },
              startPeriod: {
                type: "string",
                description: "Start period",
              },
            },
          },
        },
      },
    },
    networks: {
      type: "array",
      description: "Network definitions",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Network name",
          },
          driver: {
            type: "string",
            description: "Network driver",
          },
          external: {
            type: "boolean",
            description: "External network",
          },
        },
      },
    },
    volumes: {
      type: "array",
      description: "Volume definitions",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Volume name",
          },
          driver: {
            type: "string",
            description: "Volume driver",
          },
          external: {
            type: "boolean",
            description: "External volume",
          },
        },
      },
    },
    resources: {
      type: "object",
      description: "Resource constraints",
      properties: {
        cpu: {
          type: "string",
          description: "CPU allocation",
        },
        memory: {
          type: "string",
          description: "Memory allocation",
        },
        limits: {
          type: "object",
          description: "Resource limits",
          properties: {
            cpu: {
              type: "string",
              description: "CPU limit",
            },
            memory: {
              type: "string",
              description: "Memory limit",
            },
          },
        },
      },
    },
    secrets: {
      type: "array",
      description: "Secret definitions",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Secret name",
          },
          value: {
            type: "string",
            description: "Secret value",
          },
          external: {
            type: "boolean",
            description: "External secret",
          },
        },
      },
    },
    metadata: {
      type: "object",
      description: "Additional metadata",
      additionalProperties: {
        type: "string",
      },
    },
  },
};

// Default deployment configuration template
export const defaultDeploymentConfig: any = {
  name: "my-iot-deployment",
  version: "1.0.0",
  services: [
    {
      name: "iot-gateway",
      image: "iot-gateway:latest",
      ports: [
        {
          container: 8080,
          host: 8080,
          protocol: "tcp",
        },
      ],
      environment: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },
      healthCheck: {
        test: ["CMD", "curl", "-f", "http://localhost:8080/health"],
        interval: "30s",
        timeout: "10s",
        retries: 3,
        startPeriod: "40s",
      },
    },
  ],
  networks: [
    {
      name: "iot-network",
      driver: "bridge",
    },
  ],
  resources: {
    cpu: "0.5",
    memory: "512M",
    limits: {
      cpu: "1.0",
      memory: "1G",
    },
  },
};
