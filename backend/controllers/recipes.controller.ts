import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@backend/middleware/auth";
import { apiHandler } from "@backend/middleware/api-handler";
import { parseId, parseOrThrow } from "@shared/validation/helpers";
import { targetQtyQuerySchema } from "@shared/validation/quantity.schema";
import { buildBreakdown, getRecipe, listRecipes } from "@backend/services/recipes/recipe.service";

type IdContext = { params: Promise<{ id: string }> };

/** GET /api/recipes */
export const listRecipesHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "recipes:read");
  return NextResponse.json({ recipes: await listRecipes() });
});

/** GET /api/recipes/:id */
export const getRecipeHandler = apiHandler(async (request: NextRequest, { params }: IdContext) => {
  await requireApiUser(request, "recipes:read");
  const id = parseId((await params).id, "Recipe");
  return NextResponse.json({ recipe: await getRecipe(id) });
});

/** GET /api/recipes/:id/breakdown?qty=50 — expected component counts calculated on the server. */
export const recipeBreakdownHandler = apiHandler(async (request: NextRequest, { params }: IdContext) => {
  await requireApiUser(request, "recipes:read");
  const id = parseId((await params).id, "Recipe");
  const { qty } = parseOrThrow(targetQtyQuerySchema, { qty: request.nextUrl.searchParams.get("qty") ?? undefined });
  return NextResponse.json({ breakdown: buildBreakdown(await getRecipe(id), qty) });
});
