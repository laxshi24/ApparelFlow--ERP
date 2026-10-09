import { BookOpen, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, PageSkeleton } from "@/components/ui/feedback";
import { listRecipes } from "@/features/recipes/server/recipe-queries";
import { requirePageUser } from "@/lib/auth/guards";
import { formatPct, formatYards } from "@/lib/format";

export const metadata: Metadata = { title: "Recipes" };

export default function RecipesPage() {
  return (
    <>
      <PageHeader
        title="Production recipes"
        description="Component breakdown, standard fabric consumption and wastage caps for each garment."
      />
      <Suspense fallback={<PageSkeleton label="Loading recipes" />}>
        <RecipeList />
      </Suspense>
    </>
  );
}

async function RecipeList() {
  const { user, allowed } = await requirePageUser("recipes:read");
  if (!allowed) return <AccessDenied role={user.role} what="view recipes" />;
  const recipes = await listRecipes();
  if (recipes.length === 0) {
    return (
      <EmptyState icon={BookOpen} title="No recipes yet">
        Run <code>npm run db:seed</code> to load the production recipes.
      </EmptyState>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link
            href={`/recipes/${r.id}`}
            className="group block rounded-lg border border-line bg-surface p-5 shadow-sm transition-colors hover:border-brand"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-brand">{r.recipeCode}</p>
                <h2 className="mt-0.5 text-lg font-bold text-ink">{r.name}</h2>
                <p className="text-sm text-ink-muted">{r.category}</p>
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted group-hover:text-brand" />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Fabric / garment</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatYards(r.stdFabricYards)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Wastage cap</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatPct(r.wastageCap, { signed: false })}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Components</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                  {r.componentCount} <span className="font-normal text-ink-muted">({r.piecesPerGarment} pcs)</span>
                </dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
