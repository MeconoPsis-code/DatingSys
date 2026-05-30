import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

/**
 * Create a child logger scoped to a module
 *
 * Usage:
 * ```ts
 * const log = createLogger("auth");
 * log.info("User logged in");
 * ```
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
