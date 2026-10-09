import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/feedback";
import { CreateOrderForm } from "@/features/cutting-orders/ui/create-order-form";
import { getRecipe, listRecipes } from "@/features/recipes/server/recipe-queries";
import { requirePageUser } from "@/lib/auth/guards";

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
