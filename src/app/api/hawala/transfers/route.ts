import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { isSalesperson } from "@/lib/shop-scope";
import { Role } from "@prisma/client";

const transferSchema = z.object({
  receiverId: z.string().min(1),
  amount: z.number().positive(),
  notes: z.string().optional(),
  transferDate: z.string().datetime().optional(),
});

const transferSelect = {
  id: true,
  salespersonId: true,
  receiverId: true,
  amount: true,
  notes: true,
  transferDate: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  salesperson: { select: { id: true, name: true } },
  receiver: { select: { id: true, name: true, phone: true } },
  confirmedBy: { select: { id: true, name: true } },
};

function serializeTransfer(transfer: {
  id: string;
  salespersonId: string;
  receiverId: string;
  amount: { toString(): string };
  notes: string | null;
  transferDate: Date;
  status: string;
  confirmedAt: Date | null;
  createdAt: Date;
  salesperson: { id: string; name: string };
  receiver: { id: string; name: string; phone: string | null };
  confirmedBy: { id: string; name: string } | null;
}) {
  return {
    ...transfer,
    amount: decimalToNumber(transfer.amount),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const salespersonId = request.nextUrl.searchParams.get("salespersonId");
    const status = request.nextUrl.searchParams.get("status");

    const statusFilter =
      status === "PENDING" || status === "CONFIRMED" ? { status: status as "PENDING" | "CONFIRMED" } : {};

    if (isSalesperson(session)) {
      const transfers = await prisma.hawalaTransfer.findMany({
        where: { salespersonId: session.id, ...statusFilter },
        select: transferSelect,
        orderBy: { transferDate: "desc" },
      });
      return jsonResponse(transfers.map(serializeTransfer));
    }

    await requireSession(Role.ADMIN);

    const where = {
      ...statusFilter,
      ...(salespersonId ? { salespersonId } : {}),
    };

    const transfers = await prisma.hawalaTransfer.findMany({
      where,
      select: transferSelect,
      orderBy: { transferDate: "desc" },
    });
    return jsonResponse(transfers.map(serializeTransfer));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSalesperson(session)) {
      throw new Error("Forbidden");
    }

    const body = await request.json();
    const data = transferSchema.parse(body);

    const receiver = await prisma.hawalaReceiver.findFirst({
      where: {
        id: data.receiverId,
        salespersonId: session.id,
        isActive: true,
      },
    });
    if (!receiver) throw new Error("Receiver not found or not assigned to you");

    const transfer = await prisma.hawalaTransfer.create({
      data: {
        salespersonId: session.id,
        receiverId: data.receiverId,
        amount: data.amount,
        notes: data.notes?.trim() || null,
        transferDate: data.transferDate ? new Date(data.transferDate) : new Date(),
      },
      select: transferSelect,
    });

    return jsonResponse(serializeTransfer(transfer), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
