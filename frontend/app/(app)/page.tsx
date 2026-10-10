import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@frontend/components/ui/feedback";
import { requirePageUser } from "@backend/middleware/auth";
import { ROLE_HOME } from "@shared/permissions";

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
