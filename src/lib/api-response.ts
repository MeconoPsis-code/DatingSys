import { NextResponse } from "next/server";

/**
 * Standardized success response
 */
export function success<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/**
 * Standardized error response
 */
export function error(
  code: string,
  message: string,
  status: number = 400
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Standardized paginated response
 */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): NextResponse {
  return NextResponse.json({
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
