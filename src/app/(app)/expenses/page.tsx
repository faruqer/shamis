import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ExpensesClient } from "./expenses-client";

export default async function ExpensesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ExpensesClient user={session} />;
}
