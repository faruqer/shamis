import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isSalesperson, requireSalespersonShopId, shopCartonFilter } from "@/lib/shop-scope";
import { Role } from "@prisma/client";
import { isWarehouseLocked } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location");

    const where: {
      location?: "WAREHOUSE" | "SHOP";
      shopId?: string;
      OR: [{ remainingCartons: { gt: number } }, { remainingItems: { gt: number } }];
    } = {
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    };

    if (isSalesperson(session)) {
      if (location === "WAREHOUSE") {
        where.location = "WAREHOUSE";
      } else {
        Object.assign(where, shopCartonFilter(session));
      }
    } else {
      if (location) {
        where.location = location as "WAREHOUSE" | "SHOP";
      }
    }

    const cartons = await prisma.carton.findMany({
      where,
      include: {
        shop: { select: { id: true, name: true } },
        product: {
          include: {
            import: { select: { batchNumber: true, importDate: true } },
          },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { cartonNumber: "asc" }],
    });

    const warehouseLocked = isSalesperson(session) ? await isWarehouseLocked() : false;

    const sanitized =
      session.role === Role.SALESPERSON
        ? cartons.map(({ product, ...carton }) => ({
            ...carton,
            product: {
              name: product.name,
              unitCost: location === "WAREHOUSE" ? product.unitCost : undefined,
              import: { importDate: product.import.importDate },
            },
          }))
        : cartons;

    return jsonResponse(
      isSalesperson(session) ? { cartons: sanitized, warehouseLocked } : sanitized
    );
  } catch (error) {
    return handleApiError(error);
  }
}
