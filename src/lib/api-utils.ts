import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return errorResponse(error.errors.map((e) => e.message).join(", "), 400);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return errorResponse("Your session is invalid. Please sign out and sign in again.", 401);
    }
    if (error.code === "P2002") {
      return errorResponse("A record with this value already exists.", 400);
    }
  }
  if (error instanceof Error) {
    if (error.message === "Unauthorized") return errorResponse("Unauthorized", 401);
    if (error.message === "Forbidden") return errorResponse("Forbidden", 403);
    return errorResponse(error.message, 400);
  }
  return errorResponse("Internal server error", 500);
}
