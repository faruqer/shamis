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
      return errorResponse(
        "This record is linked to other data (sales, payments, stock…) and cannot be changed or deleted.",
        409
      );
    }
    if (error.code === "P2002") {
      return errorResponse("A record with this value already exists.", 400);
    }
    if (error.code === "P2025") {
      return errorResponse("Record not found. It may have been changed or deleted — refresh and try again.", 404);
    }
    console.error(error);
    return errorResponse("Database error. Please try again.", 500);
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(error);
    return errorResponse("Invalid data sent to the server.", 400);
  }
  if (error instanceof Error) {
    if (error.message === "Unauthorized") return errorResponse("Unauthorized", 401);
    if (error.message === "Forbidden") return errorResponse("Forbidden", 403);
    // Routes throw plain Errors carrying user-facing rule messages ("Not enough stock"),
    // so those are echoed back. These subclasses are never intentional — they mean a bug,
    // and their messages expose internals, so log them and answer generically.
    // A malformed JSON body reaches here as a SyntaxError from request.json() — a client error.
    if (error instanceof SyntaxError) {
      return errorResponse("Invalid request body.", 400);
    }
    if (
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      error instanceof RangeError
    ) {
      console.error(error);
      return errorResponse("Something went wrong. Please try again.", 500);
    }
    return errorResponse(error.message, 400);
  }
  return errorResponse("Internal server error", 500);
}
