import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";
import { getAppSettings, setWarehouseLocked } from "@/lib/settings";

const updateSchema = z.object({
  warehouseLocked: z.boolean(),
});

export async function GET() {
  try {
    await requireSession();
    const settings = await getAppSettings();
    return jsonResponse({ warehouseLocked: settings.warehouseLocked });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = updateSchema.parse(body);
    const settings = await setWarehouseLocked(data.warehouseLocked);
    return jsonResponse({ warehouseLocked: settings.warehouseLocked });
  } catch (error) {
    return handleApiError(error);
  }
}
