import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/feedback";
import { getRecipe } from "@/features/recipes/server/recipe-queries";
import { ExpectedCountsCalculator } from "@/features/recipes/ui/expected-counts-calculator";
import { requirePageUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { NotFoundError } from "@/lib/errors";
import { formatPct, formatYards } from "@/lib/format";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Recipe" };

export default function RecipeDetailPage({ params }: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading recipe" />}>
      <RecipeDetail params={params} />
    </Suspense>
  );
}

async function RecipeDetail({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const { user, allowed } = await requirePageUser("recipes:read");
  if (!allowed) return <AccessDenied role={user.role} what="view recipes" />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="font-mono text-brand">{recipe.recipeCode}</span> · {recipe.name}
          </>
        }
        description={`Category: ${recipe.category}`}
        actions={
          <>
            <LinkButton href="/recipes" variant="secondary">
              <ArrowLeft aria-hidden className="size-4" /> All recipes
            </LinkButton>
            {can(user.role, "orders:create") && (
              <LinkButton href={`/orders/new?recipe=${recipe.id}`}>Create cutting order</LinkButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader title="Recipe specification" />
          <CardBody className="space-y-5">
            <DescriptionList
              items={[
                { label: "Standard fabric", value: `${formatYards(recipe.stdFabricYards)} per garment` },
                { label: "Wastage cap", value: formatPct(recipe.wastageCap, { signed: false }) },
                { label: "Components", value: recipe.components.length },
              ]}
            />
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Components required per garment</caption>
                <thead className="bg-neutral-bg text-left text-ink">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Pieces / garment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recipe.components.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-ink">{c.componentName}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{c.piecesPerGarment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Expected component calculator"
            description="Expected quantity = target batch quantity × pieces per garment (calculated on the server)."
          />
          <CardBody>
            <ExpectedCountsCalculator recipeId={recipe.id} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
