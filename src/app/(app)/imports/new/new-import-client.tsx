"use client";

import { ImportForm } from "@/components/imports/import-form";
import { Role } from "@prisma/client";

export function NewImportClient({ user }: { user: { name: string; role: Role; email: string } }) {
  return <ImportForm user={user} mode="create" />;
}
