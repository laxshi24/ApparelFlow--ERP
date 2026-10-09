import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/layout/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<AppHeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
