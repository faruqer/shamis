import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NewImportClient } from "./new-import-client";

export default async function NewImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN) redirect("/imports");

  return <NewImportClient user={session} />;
}
