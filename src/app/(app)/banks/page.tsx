import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Bank Accounts is a tab of the Balance page; this route keeps old links working. */
export default async function BanksPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect("/balance?tab=banks");
}
