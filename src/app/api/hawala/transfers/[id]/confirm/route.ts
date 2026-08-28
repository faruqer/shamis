import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { Role, HawalaStatus } from "@prisma/client";

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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(Role.ADMIN);
    const { id } = await params;

    const existing = await prisma.hawalaTransfer.findUnique({ where: { id } });
    if (!existing) throw new Error("Transfer not found");
    if (existing.status === HawalaStatus.CONFIRMED) {
      throw new Error("Transfer already confirmed");
    }

    const transfer = await prisma.hawalaTransfer.update({
      where: { id },
      data: {
        status: HawalaStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedById: session.id,
      },
      select: transferSelect,
    });

    return jsonResponse({
      ...transfer,
      amount: decimalToNumber(transfer.amount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
