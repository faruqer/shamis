import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NewImportClient } from "./new-import-client";

export default async function NewImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <NewImportClient user={session} />;
}
