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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

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
