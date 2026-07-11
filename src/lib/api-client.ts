interface ApiErrorEnvelope {
  error?: {
    message?: unknown;
  };
}

export class ApiResponseError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

function fallbackMessage(response: Response, fallback: string): string {
  return response.status > 0 ? `${fallback}（HTTP ${response.status}）` : fallback;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const message = (payload as ApiErrorEnvelope).error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

/**
 * Throws a localized, stable error for any non-successful API response.
 * Empty, truncated, and HTML error bodies intentionally fall back to the HTTP status.
 */
export async function ensureApiSuccess(
  response: Response,
  fallback: string
): Promise<void> {
  if (response.ok) return;

  await readApiJson<unknown>(response, fallback);
}

/**
 * Reads a JSON API response without leaking native JSON parsing errors to the UI.
 */
export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const messageWithStatus = fallbackMessage(response, fallback);
  let rawBody: string;

  try {
    rawBody = await response.text();
  } catch {
    throw new ApiResponseError(messageWithStatus, response.status);
  }

  if (!rawBody.trim()) {
    throw new ApiResponseError(messageWithStatus, response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiResponseError(messageWithStatus, response.status);
  }

  if (!response.ok) {
    throw new ApiResponseError(
      extractErrorMessage(payload) ?? messageWithStatus,
      response.status
    );
  }

  return payload as T;
}

export function getUserFacingRequestError(error: unknown, fallback: string): string {
  if (error instanceof ApiResponseError) return error.message;

  if (
    error instanceof TypeError &&
    /fetch|network|load failed|connection/i.test(error.message)
  ) {
    return "网络连接失败，请检查网络后重试";
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
