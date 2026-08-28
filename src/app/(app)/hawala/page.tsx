import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { HawalaClient } from "./hawala-client";

export default async function HawalaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN && session.role !== Role.SALESPERSON) {
    redirect("/dashboard");
  }
  return <HawalaClient user={session} />;
}
