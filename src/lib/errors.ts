/**
 * Application error codes with default HTTP status and messages
 */
export const ErrorCodes = {
  // Auth errors (401)
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "请先登录",
    status: 401,
  },

  // Permission errors (403)
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "没有权限执行此操作",
    status: 403,
  },
  PROFILE_NOT_VERIFIED: {
    code: "PROFILE_NOT_VERIFIED",
    message: "请先完成群成员认证",
    status: 403,
  },
  MEMBERSHIP_EXPIRED: {
    code: "MEMBERSHIP_EXPIRED",
    message: "群成员认证已过期，请重新认证",
    status: 403,
  },
  RATING_INCOMPLETE: {
    code: "RATING_INCOMPLETE",
    message: "评分中，请耐心等待",
    status: 403,
  },

  // Not found (404)
  NOT_FOUND: {
    code: "NOT_FOUND",
    message: "资源不存在",
    status: 404,
  },

  // Validation (422)
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    message: "请求数据校验失败",
    status: 422,
  },

  // Rate limit (429)
  COOLDOWN_ACTIVE: {
    code: "COOLDOWN_ACTIVE",
    message: "操作过于频繁，请稍后再试",
    status: 429,
  },

  // Server error (500)
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "服务器内部错误",
    status: 500,
  },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Application error class with structured error info
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(errorCode: ErrorCode, customMessage?: string) {
    const errorDef = ErrorCodes[errorCode];
    super(customMessage || errorDef.message);
    this.code = errorDef.code;
    this.status = errorDef.status;
  }
}
