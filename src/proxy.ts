import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/epics") ||
    pathname.startsWith("/quests") ||
    pathname.startsWith("/notice-board") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/skills") ||
    pathname.startsWith("/tree") ||
    pathname.startsWith("/roadmap") ||
    pathname.startsWith("/trophy-room") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/help") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/ai") ||
    pathname.startsWith("/board") ||
    pathname.startsWith("/profile");

  if (!sessionCookie && isProtected) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (sessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/epics/:path*",
    "/quests/:path*",
    "/notice-board/:path*",
    "/inventory/:path*",
    "/categories/:path*",
    "/skills/:path*",
    "/tree/:path*",
    "/roadmap/:path*",
    "/trophy-room/:path*",
    "/onboarding/:path*",
    "/help/:path*",
    "/calendar/:path*",
    "/ai/:path*",
    "/board/:path*",
    "/profile/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
