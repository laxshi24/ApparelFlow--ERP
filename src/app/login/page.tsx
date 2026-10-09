import { Scissors } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeRedirectPath } from "@/features/authentication/schemas/login.schema";
import { getDemoConfig } from "@/features/authentication/server/demo";
import { DemoCredentialsPanel } from "@/features/authentication/ui/demo-credentials-panel";
import { LoginForm } from "@/features/authentication/ui/login-form";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { getPageUser } from "@/lib/auth/guards";
import { ROLE_HOME } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main id="main" className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-header text-white">
          <Scissors aria-hidden className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">ApparelFlow ERP</h1>
          <p className="text-sm text-ink-muted">Cutting Operations &amp; Gatekeeper Verification</p>
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const next = safeRedirectPath((await searchParams).next);
  const user = await getPageUser();
  if (user) redirect(next ?? ROLE_HOME[user.role]);
  const demo = getDemoConfig();

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Card>
        <CardBody className="space-y-4 py-6">
          <h2 className="text-lg font-semibold text-ink">Sign in to your account</h2>
          <LoginForm next={next} />
        </CardBody>
      </Card>
      {demo && <DemoCredentialsPanel accounts={demo.accounts} password={demo.password} next={next} />}
    </div>
  );
}
