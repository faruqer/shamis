import { Role } from "@prisma/client";
import { OWNER_NAME } from "./brand";
import type { SessionUser } from "./auth-edge";

export type ScopedSession = SessionUser & {
  shopId?: string | null;
  shopName?: string | null;
};

export function isSalesperson(session: ScopedSession) {
  return session.role === Role.SALESPERSON;
}

export function getSalespersonShopId(session: ScopedSession) {
  if (!isSalesperson(session)) return null;
  return session.shopId ?? null;
}

export function requireSalespersonShopId(session: ScopedSession) {
  const shopId = getSalespersonShopId(session);
  if (!shopId) {
    throw new Error(`You are not assigned to a shop. Contact ${OWNER_NAME}.`);
  }
  return shopId;
}

export function shopCartonFilter(session: ScopedSession) {
  if (!isSalesperson(session)) return {};
  const shopId = requireSalespersonShopId(session);
  return {
    location: "SHOP" as const,
    shopId,
  };
}
