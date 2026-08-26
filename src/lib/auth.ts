import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";

export type { SessionUser } from "./auth-edge";
import type { SessionUser } from "./auth-edge";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

async function resolveSession(): Promise<{ session: SessionUser | null; stale: boolean }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return { session: null, stale: false };

  const payload = await verifyToken(token);
  if (!payload) return { session: null, stale: true };

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    include: { shop: { select: { name: true } } },
  });

  if (!user || !user.isActive) {
    return { session: null, stale: true };
  }

  return {
    session: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
      shopName: user.shop?.name ?? null,
    },
    stale: false,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const { session } = await resolveSession();
  return session;
}

export async function requireSession(requiredRole?: Role) {
  const { session, stale } = await resolveSession();
  if (!session) {
    if (stale) {
      await clearSessionCookie();
    }
    throw new Error("Unauthorized");
  }
  if (requiredRole && session.role !== requiredRole && session.role !== Role.ADMIN) {
    throw new Error("Forbidden");
  }
  return session;
}

export function isSecureCookieContext(proto?: string | null) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return proto === "https";
}

export async function setSessionCookie(token: string, secure = false) {
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
