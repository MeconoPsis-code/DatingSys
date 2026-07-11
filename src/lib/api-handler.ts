import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { error } from "@/lib/api-response";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<Record<string, string>> };

type HandlerFn = (
  req: NextRequest,
  context: RouteContext
) => Promise<NextResponse>;

export async function parseJsonRequest<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("VALIDATION_ERROR", "无效的请求体");
  }
}

/**
 * Wraps an API route handler with standardized error handling and logging.
 *
 * Usage:
 * ```ts
 * export const GET = apiHandler(async (req, ctx) => {
 *   // your logic here
 *   return success({ message: "ok" });
 * });
 * ```
 */
export function apiHandler(handler: HandlerFn): HandlerFn {
  return async (req: NextRequest, context: RouteContext) => {
    const startTime = Date.now();
    const method = req.method;
    const path = req.nextUrl.pathname;

    try {
      const response = await handler(req, context);

      logger.info({
        method,
        path,
        status: response.status,
        duration: Date.now() - startTime,
      });

      return response;
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn({
          method,
          path,
          error: err.code,
          message: err.message,
          duration: Date.now() - startTime,
        });
        return error(err.code, err.message, err.status);
      }

      const message =
        err instanceof Error ? err.message : "Unknown error";
      logger.error({
        method,
        path,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
        duration: Date.now() - startTime,
      });

      return error("INTERNAL_ERROR", "服务器内部错误", 500);
    }
  };
}
