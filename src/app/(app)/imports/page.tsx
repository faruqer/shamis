import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ImportsPageClient } from "./imports-client";

export default async function ImportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <ImportsPageClient user={session} />;
}
