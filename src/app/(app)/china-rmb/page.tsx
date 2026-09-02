import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { ChinaRmbClient } from "./china-rmb-client";

export default async function ChinaRmbPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN) redirect("/dashboard");
  return <ChinaRmbClient user={session} />;
}
