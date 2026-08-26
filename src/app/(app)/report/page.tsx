import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { ReportClient } from "./report-client";

export default async function ReportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === Role.SALESPERSON) redirect("/credit");
  return <ReportClient user={session} />;
}
