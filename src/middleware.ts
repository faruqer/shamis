// Security headers for every response live in next.config.ts (they also cover static files).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth-edge";

const publicPaths = ["/login", "/api/auth/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The app has no server actions; these requests are bots probing for exploits.
  if (request.headers.has("next-action")) {
    return new NextResponse(null, { status: 404 });
  }

  // Login throttling lives in the login route itself (per account and per IP).
  if (pathname === "/api/health" || publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-|manifest.webmanifest|icons/).*)",
  ],
};
