import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { hasRole } from "@/lib/rbac";
import { UserRole } from "@prisma/client";

const COOKIE_NAME = "date-session";

// Routes that are always accessible (no auth required)
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-passcode",
  "/announcements",
  "/ranking",
  "/api/auth",
  "/api/announcements",
  "/api/ranking",
  "/api/health",
  "/api/bot",           // Bot webhook — uses X-Bot-Token auth
  "/api/internal/bot",  // Internal bot APIs — uses X-Internal-Secret auth
];

// Routes that require ADMIN+ role
const ADMIN_PATHS = [
  "/dashboard",
  "/users",
  "/reports",
  "/announcements-admin",
  "/audit",
  "/api/admin",
];

// Routes that require SCORER+ role
const SCORER_PATHS = ["/scoring", "/api/scorer", "/api/scoring"];

function isPublicPath(pathname: string): boolean {
  // Allow static assets
  if (
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico")
  ) {
    return true;
  }

  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isScorerPath(pathname: string): boolean {
  return SCORER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Public routes — always allowed
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Read session cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // API routes: return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }
    // Page routes: redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Verify JWT (no DB call — just cryptographic check)
  const payload = await verifyToken(token);

  if (!payload) {
    // Invalid/expired token
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "登录已过期" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "expired");
    return NextResponse.redirect(loginUrl);
  }

  const userRole = payload.role as UserRole;

  // 4a. Profile completeness check — redirect profile-less users to /complete-profile
  //     Skip for API routes (they need access to submit profiles), and for /complete-profile itself
  if (
    !payload.hasProfile &&
    !pathname.startsWith("/complete-profile") &&
    !pathname.startsWith("/api/")
  ) {
    return NextResponse.redirect(new URL("/complete-profile", req.url));
  }

  // 4b. User WITH profile trying to access /complete-profile → redirect to profile
  if (payload.hasProfile && pathname.startsWith("/complete-profile")) {
    return NextResponse.redirect(new URL("/profile", req.url));
  }

  // 5. Admin routes — require ADMIN+ role
  if (isAdminPath(pathname)) {
    if (!hasRole(userRole, "ADMIN")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "没有权限" } },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/profile", req.url));
    }
  }

  // 5. Scorer routes — require SCORER+ role
  if (isScorerPath(pathname)) {
    if (!hasRole(userRole, "SCORER")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "没有权限" } },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/profile", req.url));
    }
  }

  // 6. All other routes — user is authenticated, allow through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
