import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** hw is a tab of the Balance page; this route only keeps old links working. */
export default async function HawalaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect("/balance?tab=hw");
}
