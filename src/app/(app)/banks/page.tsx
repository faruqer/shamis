import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { BanksClient } from "./banks-client";

export default async function BanksPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN && session.role !== Role.SALESPERSON) {
    redirect("/dashboard");
  }
  return <BanksClient user={session} />;
}
