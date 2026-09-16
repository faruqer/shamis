import { jwtVerify } from "jose";
import { Role } from "@prisma/client";

const INSECURE_SECRETS = new Set([
  "",
  "fallback-secret-change-me",
  "your-super-secret-jwt-key-change-in-production",
  "your-secret-key-here",
]);

let cachedSecret: Uint8Array | null = null;

/** Checked on first use (not at import) so `next build` works without the server's .env. */
export function getJwtSecret() {
  cachedSecret ??= loadJwtSecret();
  return cachedSecret;
}

function loadJwtSecret() {
  const secret = process.env.JWT_SECRET ?? "";
  if (INSECURE_SECRETS.has(secret) || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      // Anyone who knows a default secret can forge an admin login.
      throw new Error(
        "JWT_SECRET is missing or insecure. Set a random value of at least 32 characters in .env"
      );
    }
    return new TextEncoder().encode(secret || "fallback-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  shopId?: string | null;
  shopName?: string | null;
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  const secret = getJwtSecret(); // throws a clear error if the secret is insecure in production
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
