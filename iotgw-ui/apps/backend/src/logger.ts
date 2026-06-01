import pino, { type LoggerOptions, type Level } from "pino";

type NodeEnv = "development" | "production" | "test";

const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
const logLevel = (process.env.LOG_LEVEL ?? "info") as Level;

interface PrettyLoggerOptions {
  level: Level;
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
}

type LoggerConfig = PrettyLoggerOptions | ProductionLoggerOptions | boolean;

const envToLogger: Record<NodeEnv, LoggerConfig> = {
  development: {
    level: logLevel,
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
  },
  test: false,
};

export const logger = pino(envToLogger[nodeEnv] as LoggerOptions);

export default envToLogger;
