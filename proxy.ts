import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const ADMIN_COOKIE = "igo_super_admin_session";

const dashboardAuth = withAuth({
  pages: {
    signIn: "/login",
  },
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    if (request.nextUrl.searchParams.has("username") || request.nextUrl.searchParams.has("password")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.searchParams.delete("username");
      loginUrl.searchParams.delete("password");
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  if (
    pathname === "/super-admin/login" ||
    pathname === "/api/super-admin/login" ||
    pathname === "/igo-admin/login" ||
    pathname === "/api/igo-admin/login"
  ) {
    return NextResponse.next();
  }

  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    const hasAdminSession = Boolean(request.cookies.get(ADMIN_COOKIE)?.value);

    if (!hasAdminSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/super-admin/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  if (pathname === "/igo-admin" || pathname.startsWith("/igo-admin/")) {
    const hasAdminSession = Boolean(request.cookies.get(ADMIN_COOKIE)?.value);

    if (!hasAdminSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/super-admin/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  return dashboardAuth(request as never, event as never);
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/super-admin/:path*",
    "/api/super-admin/login",
    "/igo-admin/:path*",
    "/api/igo-admin/:path*",
  ],
};
