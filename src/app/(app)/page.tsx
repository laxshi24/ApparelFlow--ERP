import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { requirePageUser } from "@/lib/auth/guards";
import { ROLE_HOME } from "@/lib/auth/permissions";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoleHomeRedirect />
    </Suspense>
  );
}

async function RoleHomeRedirect(): Promise<never> {
  const { user } = await requirePageUser();
  redirect(ROLE_HOME[user.role]);
}
