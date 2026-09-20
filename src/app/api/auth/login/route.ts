import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  createToken,
  isSecureCookieContext,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { clearRateLimit, clientIp, rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  // Phones often capitalize the first letter or add a trailing space.
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Per account: generous enough for a mistyped password on a phone, tight enough to stop guessing.
// Per IP: deliberately looser, because a reverse proxy that doesn't forward the real client
// address puts the whole shop in one bucket, where a strict limit would lock everyone out.
const MAX_ATTEMPTS_PER_ACCOUNT = 10;
const MAX_ATTEMPTS_PER_IP = 30;
const WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // Throttle per account and, when the proxy tells us who is calling, per IP too.
    // Without a reverse proxy there is no client address, and an IP-only limit would put
    // everyone on the LAN in one bucket where a single fat-fingered phone locks out the shop.
    const ip = clientIp(request);
    const throttleKeys: Array<[key: string, limit: number]> = [
      [`login:email:${email}`, MAX_ATTEMPTS_PER_ACCOUNT],
    ];
    if (ip !== "unknown") throttleKeys.push([`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP]);

    for (const [key, limit] of throttleKeys) {
      const { allowed, retryAfter } = rateLimit(key, limit, WINDOW_MS);
      if (!allowed) {
        return errorResponse(
          `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
          429
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { shop: { select: { id: true, name: true } } },
    });
    if (!user || !user.isActive) {
      return errorResponse("Invalid email or password", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("Invalid email or password", 401);
    }

    throttleKeys.forEach(([key]) => clearRateLimit(key));

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
      shopName: user.shop?.name ?? null,
    });

    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      request.nextUrl.protocol.replace(":", "");
    await setSessionCookie(token, isSecureCookieContext(proto));

    return jsonResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
        shopName: user.shop?.name ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
