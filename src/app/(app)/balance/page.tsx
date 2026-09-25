import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoadingSpinner } from "@/components/layout/page-transition";
import { BalanceClient } from "./balance-client";

export default async function BalancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BalanceClient user={session} />
    </Suspense>
  );
}
