import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Expenses is a tab of the Balance page; this route only keeps old links working. */
export default async function ExpensesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect("/balance?tab=expenses");
}
