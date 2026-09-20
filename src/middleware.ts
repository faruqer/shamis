import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth-edge";

const publicPaths = ["/login", "/api/auth/login"];

function withSecurityHeaders(response: NextResponse, request: NextRequest) {
  const headers = response.headers;
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Only over HTTPS: once sent, browsers refuse plain http to this host for a year.
  const isHttps =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
    request.nextUrl.protocol === "https:";
  if (process.env.HSTS === "true" && isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The app has no server actions; these requests are bots probing for exploits.
  if (request.headers.has("next-action")) {
    return new NextResponse(null, { status: 404 });
  }

  // Login throttling lives in the login route itself (per account and per IP).
  if (pathname === "/api/health" || publicPaths.some((path) => pathname.startsWith(path))) {
    return withSecurityHeaders(NextResponse.next(), request);
  }

  const token = request.cookies.get("session")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        request
      );
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/login", request.url)), request);
  }

  return withSecurityHeaders(NextResponse.next(), request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-|manifest.webmanifest|icons/).*)",
  ],
};
