export const ANNOUNCEMENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export type AnnouncementStatusValue = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface ParsedAnnouncementInput {
  title?: string;
  summary?: string | null;
  content?: string;
  status?: AnnouncementStatusValue;
  pinned?: boolean;
}

interface ParseOptions {
  partial?: boolean;
}

interface ParseResult {
  data?: ParsedAnnouncementInput;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnnouncementStatus(value: unknown): value is AnnouncementStatusValue {
  return typeof value === "string" && ANNOUNCEMENT_STATUSES.includes(value as AnnouncementStatusValue);
}

export function parseAnnouncementInput(
  body: unknown,
  options: ParseOptions = {}
): ParseResult {
  const partial = options.partial ?? false;

  if (!isPlainObject(body)) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "无效的请求体",
        status: 422,
      },
    };
  }

  const data: ParsedAnnouncementInput = {};

  if (!partial || "title" in body) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "请输入公告标题",
          status: 422,
        },
      };
    }

    const title = body.title.trim();
    if (title.length > 120) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "公告标题不能超过 120 个字符",
          status: 422,
        },
      };
    }
    data.title = title;
  }

  if (!partial || "summary" in body) {
    if (body.summary == null || body.summary === "") {
      data.summary = null;
    } else if (typeof body.summary === "string") {
      const summary = body.summary.trim();
      if (summary.length > 240) {
        return {
          error: {
            code: "VALIDATION_ERROR",
            message: "公告摘要不能超过 240 个字符",
            status: 422,
          },
        };
      }
      data.summary = summary || null;
    } else {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "公告摘要格式无效",
          status: 422,
        },
      };
    }
  }

  if (!partial || "content" in body) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "请输入公告正文",
          status: 422,
        },
      };
    }

    const content = body.content.trim();
    if (content.length > 20000) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "公告正文不能超过 20000 个字符",
          status: 422,
        },
      };
    }
    data.content = content;
  }

  if (!partial || "status" in body) {
    if (body.status == null || body.status === "") {
      data.status = "DRAFT";
    } else if (isAnnouncementStatus(body.status)) {
      data.status = body.status;
    } else {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "公告状态无效",
          status: 422,
        },
      };
    }
  }

  if (!partial || "pinned" in body) {
    if (body.pinned == null) {
      data.pinned = false;
    } else if (typeof body.pinned === "boolean") {
      data.pinned = body.pinned;
    } else {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "置顶状态无效",
          status: 422,
        },
      };
    }
  }

  return { data };
}

export function publishedAtForStatus(
  status: AnnouncementStatusValue | undefined,
  currentPublishedAt?: Date | null
): Date | null | undefined {
  if (!status) return undefined;
  return status === "PUBLISHED" ? currentPublishedAt ?? new Date() : null;
}
