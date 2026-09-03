import { LedgerType, Prisma, Role } from "@prisma/client";
import { generateSaleNumber } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

export async function getShopSalesperson(tx: Tx, shopId: string) {
  const shopSalesperson = await tx.user.findFirst({
    where: {
      shopId,
      role: Role.SALESPERSON,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!shopSalesperson) {
    throw new Error("Assign a salesperson to this shop before transferring stock");
  }

  return shopSalesperson;
}

async function mergeIntoShopCarton(
  tx: Tx,
  shopCarton: {
    id: string;
    remainingCartons: number;
    remainingItems: number;
    totalCartons: number;
  },
  cartonsToAdd: number,
  itemsToAdd: number,
  priceData: { warehouseLeavingPrice: number; retailUnitPrice: number }
) {
  await tx.carton.update({
    where: { id: shopCarton.id },
    data: {
      remainingCartons: shopCarton.remainingCartons + cartonsToAdd,
      remainingItems: shopCarton.remainingItems + itemsToAdd,
      totalCartons: shopCarton.totalCartons + cartonsToAdd,
      ...priceData,
    },
  });
}

export async function transferStockToShop(
  tx: Tx,
  carton: {
    id: string;
    productId: string;
    cartonNumber: string;
    itemsPerCarton: number;
    remainingCartons: number;
    remainingItems: number;
  },
  shopId: string,
  cartonsToTransfer: number,
  warehouseLeavingPrice: number,
  retailUnitPrice: number
) {
  const itemsMoved = cartonsToTransfer * carton.itemsPerCarton;

  if (cartonsToTransfer > carton.remainingCartons) {
    throw new Error("Not enough cartons to transfer");
  }

  const shop = await tx.shop.findUnique({ where: { id: shopId } });
  if (!shop || !shop.isActive) {
    throw new Error("Shop not found");
  }

  const newRemainingCartons = carton.remainingCartons - cartonsToTransfer;
  const newRemainingItems = carton.remainingItems - itemsMoved;

  const priceData = {
    warehouseLeavingPrice,
    retailUnitPrice,
  };

  const existingShopCarton = await tx.carton.findFirst({
    where: { productId: carton.productId, location: "SHOP", shopId },
  });

  if (cartonsToTransfer === carton.remainingCartons && newRemainingItems === 0) {
    if (existingShopCarton && existingShopCarton.id !== carton.id) {
      await mergeIntoShopCarton(
        tx,
        existingShopCarton,
        cartonsToTransfer,
        itemsMoved,
        priceData
      );
      await tx.carton.update({
        where: { id: carton.id },
        data: { remainingCartons: 0, remainingItems: 0 },
      });
    } else {
      await tx.carton.update({
        where: { id: carton.id },
        data: {
          location: "SHOP",
          shopId,
          ...priceData,
        },
      });
    }
    return;
  }

  await tx.carton.update({
    where: { id: carton.id },
    data: {
      remainingCartons: newRemainingCartons,
      remainingItems: newRemainingItems,
    },
  });

  if (existingShopCarton) {
    await mergeIntoShopCarton(
      tx,
      existingShopCarton,
      cartonsToTransfer,
      itemsMoved,
      priceData
    );
  } else {
    await tx.carton.create({
      data: {
        productId: carton.productId,
        cartonNumber: `${carton.cartonNumber}-shop-${shopId.slice(-8)}`,
        itemsPerCarton: carton.itemsPerCarton,
        totalCartons: cartonsToTransfer,
        remainingCartons: cartonsToTransfer,
        remainingItems: itemsMoved,
        location: "SHOP",
        shopId,
        ...priceData,
      },
    });
  }
}

export async function returnStockToWarehouse(
  tx: Tx,
  shopCarton: {
    id: string;
    productId: string;
    cartonNumber: string;
    itemsPerCarton: number;
    totalCartons: number;
    remainingCartons: number;
    remainingItems: number;
    shopId: string | null;
    warehouseLeavingPrice: { toString(): string } | null;
  },
  cartonsToReturn: number
) {
  if (!shopCarton.shopId) {
    throw new Error("Shop stock location is invalid");
  }

  const itemsToReturn = cartonsToReturn * shopCarton.itemsPerCarton;

  if (cartonsToReturn > shopCarton.remainingCartons) {
    throw new Error("Not enough cartons to return");
  }
  if (itemsToReturn > shopCarton.remainingItems) {
    throw new Error("Not enough stock to return");
  }

  const newShopCartons = shopCarton.remainingCartons - cartonsToReturn;
  const newShopItems = shopCarton.remainingItems - itemsToReturn;

  const warehouseCarton = await tx.carton.findFirst({
    where: {
      productId: shopCarton.productId,
      location: "WAREHOUSE",
    },
    orderBy: { createdAt: "asc" },
  });

  if (warehouseCarton) {
    await tx.carton.update({
      where: { id: warehouseCarton.id },
      data: {
        remainingCartons: warehouseCarton.remainingCartons + cartonsToReturn,
        remainingItems: warehouseCarton.remainingItems + itemsToReturn,
        totalCartons: warehouseCarton.totalCartons + cartonsToReturn,
      },
    });
  } else if (newShopCartons === 0 && newShopItems === 0) {
    await tx.carton.update({
      where: { id: shopCarton.id },
      data: {
        location: "WAREHOUSE",
        shopId: null,
        warehouseLeavingPrice: null,
        retailUnitPrice: null,
      },
    });
    return { shopId: shopCarton.shopId, itemsReturned: itemsToReturn };
  } else {
    await tx.carton.create({
      data: {
        productId: shopCarton.productId,
        cartonNumber: shopCarton.cartonNumber.replace(/-shop-[a-z0-9]+$/i, ""),
        itemsPerCarton: shopCarton.itemsPerCarton,
        totalCartons: cartonsToReturn,
        remainingCartons: cartonsToReturn,
        remainingItems: itemsToReturn,
        location: "WAREHOUSE",
      },
    });
  }

  if (newShopCartons === 0 && newShopItems === 0) {
    await tx.carton.update({
      where: { id: shopCarton.id },
      data: { remainingCartons: 0, remainingItems: 0 },
    });
  } else {
    await tx.carton.update({
      where: { id: shopCarton.id },
      data: {
        remainingCartons: newShopCartons,
        remainingItems: newShopItems,
        totalCartons: Math.max(0, shopCarton.totalCartons - cartonsToReturn),
      },
    });
  }

  return { shopId: shopCarton.shopId, itemsReturned: itemsToReturn };
}

export async function consolidateDuplicateShopCartons(tx: Tx, shopId?: string) {
  const shopCartons = await tx.carton.findMany({
    where: {
      location: "SHOP",
      ...(shopId ? { shopId } : {}),
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    },
    orderBy: [{ productId: "asc" }, { createdAt: "asc" }],
  });

  const groups = new Map<string, typeof shopCartons>();

  for (const carton of shopCartons) {
    if (!carton.shopId) continue;
    const key = `${carton.productId}:${carton.shopId}`;
    const group = groups.get(key) ?? [];
    group.push(carton);
    groups.set(key, group);
  }

  for (const cartons of groups.values()) {
    if (cartons.length <= 1) continue;

    const primary = cartons[0];
    let remainingCartons = primary.remainingCartons;
    let remainingItems = primary.remainingItems;
    let totalCartons = primary.totalCartons;
    const latest = cartons[cartons.length - 1];

    for (let i = 1; i < cartons.length; i++) {
      const duplicate = cartons[i];
      remainingCartons += duplicate.remainingCartons;
      remainingItems += duplicate.remainingItems;
      totalCartons += duplicate.totalCartons;

      await tx.carton.update({
        where: { id: duplicate.id },
        data: { remainingCartons: 0, remainingItems: 0 },
      });
    }

    await tx.carton.update({
      where: { id: primary.id },
      data: {
        remainingCartons,
        remainingItems,
        totalCartons,
        warehouseLeavingPrice: latest.warehouseLeavingPrice,
        retailUnitPrice: latest.retailUnitPrice,
      },
    });
  }
}

export function generateReturnReference() {
  return generateSaleNumber("SR");
}
