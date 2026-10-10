import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@frontend/components/layout/access-denied";
import { LinkButton } from "@frontend/components/ui/button";
import { PageHeader } from "@frontend/components/ui/card";
import { PageSkeleton } from "@frontend/components/ui/feedback";
import { CreateOrderForm } from "@frontend/components/orders/create-order-form";
import { getRecipe, listRecipes } from "@backend/services/recipes/recipe.service";
import { requirePageUser } from "@backend/middleware/auth";

export const metadata: Metadata = { title: "New cutting order" };

export default function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  return (
    <>
      <PageHeader
        title="New cutting order"
        description="Record a cut batch. It is submitted straight into the verification queue."
        actions={
          <LinkButton href="/orders" variant="secondary">
            <ArrowLeft aria-hidden className="size-4" /> Cutting orders
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton label="Loading form" />}>
        <NewOrderContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewOrderContent({ searchParams }: { searchParams: PageProps<"/orders/new">["searchParams"] }) {
  const { user, allowed } = await requirePageUser("orders:create");
  if (!allowed) return <AccessDenied role={user.role} what="create cutting orders" />;
  const { recipe } = await searchParams;
  const summaries = await listRecipes();
  const recipes = await Promise.all(summaries.map((r) => getRecipe(r.id)));
  return <CreateOrderForm recipes={recipes} initialRecipeId={typeof recipe === "string" ? recipe : undefined} />;
}
