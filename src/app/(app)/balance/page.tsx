import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { LedgerClient } from "../ledger/ledger-client";

export default async function BalancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN) redirect("/credit");
  return <LedgerClient user={session} />;
}
