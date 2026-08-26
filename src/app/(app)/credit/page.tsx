import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CreditClient } from "./credit-client";

export default async function CreditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.SALESPERSON) redirect("/balance");
  return <CreditClient user={session} />;
}
