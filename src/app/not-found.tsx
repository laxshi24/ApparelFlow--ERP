import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <SearchX aria-hidden className="size-12 text-ink-muted" />
      <h1 className="text-2xl font-bold text-ink">Page not found (404)</h1>
      <p className="text-sm text-ink">
        The page or record does not exist, or it is not available to your role. Verified-only areas never reveal pending or
        rejected batches.
      </p>
      <LinkButton href="/">Go to my dashboard</LinkButton>
    </main>
  );
}
