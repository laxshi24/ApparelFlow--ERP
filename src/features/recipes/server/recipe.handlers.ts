import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { apiHandler } from "@/lib/http/api-handler";
import { parseId, parseOrThrow } from "@/lib/validation";
import { targetQtyQuerySchema } from "../schemas/quantity.schema";
import { buildBreakdown, getRecipe, listRecipes } from "./recipe-queries";

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
