import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SalesClient } from "./sales-client";

export default async function SalesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <SalesClient user={session} />;
}
