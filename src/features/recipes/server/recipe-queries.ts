import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { expectedComponentQuantities, type ExpectedComponent } from "@/domain/quantities";
import { calculateWastage } from "@/domain/wastage";
import { db, type DbExecutor } from "@/lib/database/client";
import { recipeComponents, recipes } from "@/lib/database/schema";
import { NotFoundError } from "@/lib/errors";

export type RecipeSummary = {
  id: string;
  recipeCode: string;
  name: string;
  category: string;
  stdFabricYards: number;
  wastageCap: number;
  componentCount: number;
  piecesPerGarment: number;
};

export type RecipeComponent = { id: string; componentName: string; piecesPerGarment: number; imageUrl: string | null };

export type RecipeDetail = Omit<RecipeSummary, "componentCount" | "piecesPerGarment"> & { components: RecipeComponent[] };

export type RecipeBreakdown = {
  recipeId: string;
  targetQty: number;
  components: ExpectedComponent[];
  totalPieces: number;
  expectedFabricYds: number;
};

export async function listRecipes(): Promise<RecipeSummary[]> {
  return db()
    .select({
      id: recipes.id,
      recipeCode: recipes.recipeCode,
      name: recipes.name,
      category: recipes.category,
      stdFabricYards: recipes.stdFabricYards,
      wastageCap: recipes.wastageCap,
      componentCount: sql<number>`count(${recipeComponents.id})::int`,
      piecesPerGarment: sql<number>`coalesce(sum(${recipeComponents.piecesPerGarment}), 0)::int`,
    })
    .from(recipes)
    .leftJoin(recipeComponents, eq(recipeComponents.recipeId, recipes.id))
    .groupBy(recipes.id)
    .orderBy(asc(recipes.recipeCode));
}

/** Loads a recipe with its components; usable inside a transaction. */
export async function getRecipe(recipeId: string, executor: DbExecutor = db()): Promise<RecipeDetail> {
  const [recipe] = await executor
    .select({
      id: recipes.id,
      recipeCode: recipes.recipeCode,
      name: recipes.name,
      category: recipes.category,
      stdFabricYards: recipes.stdFabricYards,
      wastageCap: recipes.wastageCap,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  if (!recipe) throw new NotFoundError("Recipe not found");

  const components = await executor
    .select({
      id: recipeComponents.id,
      componentName: recipeComponents.componentName,
      piecesPerGarment: recipeComponents.piecesPerGarment,
      imageUrl: recipeComponents.imageUrl,
    })
    .from(recipeComponents)
    .where(eq(recipeComponents.recipeId, recipeId))
    .orderBy(asc(recipeComponents.sortOrder), asc(recipeComponents.componentName));

  return { ...recipe, components };
}

/** Server-side multiplier: expected counts derive only from database recipe data. */
export function buildBreakdown(recipe: RecipeDetail, targetQty: number): RecipeBreakdown {
  const components = expectedComponentQuantities(targetQty, recipe.components);
  const { expectedFabricYds } = calculateWastage({
    targetQty,
    stdFabricYards: recipe.stdFabricYards,
    actualFabricYds: 0,
    wastageCapPct: recipe.wastageCap,
  });
  return {
    recipeId: recipe.id,
    targetQty,
    components,
    totalPieces: components.reduce((sum, c) => sum + c.expectedQty, 0),
    expectedFabricYds,
  };
}
