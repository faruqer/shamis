import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { EditImportClient } from "./edit-import-client";

interface EditImportPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditImportPage({ params }: EditImportPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  return <EditImportClient user={session} importId={id} />;
}
