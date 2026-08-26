import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";
import { EditImportClient } from "./edit-import-client";

interface EditImportPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditImportPage({ params }: EditImportPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== Role.ADMIN) redirect("/imports");

  const { id } = await params;
  return <EditImportClient user={session} importId={id} />;
}
