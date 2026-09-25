import pino, { type LoggerOptions, type Level } from "pino";

type NodeEnv = "development" | "production" | "test";

const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
const logLevel = (process.env.LOG_LEVEL ?? "info") as Level;

// Defense in depth for task-130: a deployment configuration can carry
// provisioning secrets, so these paths are censored even if a call site logs
// one by mistake (the procedure helpers already drop it via redactForLog).
const redact = {
  paths: [
    "configuration",
    "*.configuration",
    "*.*.configuration",
    "json_data",
    "*.json_data",
    "p_configuration_json",
    "*.p_configuration_json",
  ],
  censor: "[redacted]",
};

interface PrettyLoggerOptions {
  level: Level;
  redact: typeof redact;
  transport: {
    target: string;
    options: {
      translateTime: string;
      ignore: string;
      colorize: boolean;
    };
  };
}

interface ProductionLoggerOptions {
  level: Level;
  redact: typeof redact;
}

type LoggerConfig = PrettyLoggerOptions | ProductionLoggerOptions | boolean;

const envToLogger: Record<NodeEnv, LoggerConfig> = {
  development: {
    level: logLevel,
    redact,
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
        colorize: true,
      },
    },
  },
  production: {
    level: logLevel,
    redact,
  },
  test: false,
};

export const logger = pino(envToLogger[nodeEnv] as LoggerOptions);

export default envToLogger;
