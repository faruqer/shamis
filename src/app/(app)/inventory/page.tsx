import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <InventoryClient user={session} />;
}
