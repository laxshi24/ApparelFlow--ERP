import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getRecipeHandler, listRecipesHandler, recipeBreakdownHandler } from "@backend/controllers/recipes.controller";
import { call, loginAs } from "@backend/tests/helpers/http";

let cookie: string;
let recipeIds: Record<string, string>;

beforeAll(async () => {
  cookie = await loginAs("cutting_supervisor");
  const { body } = await call(listRecipesHandler, "GET", "/api/recipes", { cookie });
  recipeIds = Object.fromEntries(body.recipes.map((r: { recipeCode: string; id: string }) => [r.recipeCode, r.id]));
});

const breakdown = (id: string, qty: string, c = cookie) =>
  call(recipeBreakdownHandler, "GET", `/api/recipes/${id}/breakdown?qty=${encodeURIComponent(qty)}`, { cookie: c, params: { id } });

describe("recipe catalog", () => {
  it("lists both seeded production recipes", async () => {
    const { status, body } = await call(listRecipesHandler, "GET", "/api/recipes", { cookie });
    expect(status).toBe(200);
    expect(body.recipes).toEqual([
      expect.objectContaining({ recipeCode: "REC-BL01", name: "Casual Blouse", stdFabricYards: 1.8, wastageCap: 5, componentCount: 5 }),
      expect.objectContaining({ recipeCode: "REC-CT02", name: "Crop Top", stdFabricYards: 1.1, wastageCap: 8, componentCount: 5 }),
    ]);
  });

  it("is readable by every role, but not anonymously", async () => {
    for (const role of ["cutting_verifier", "sewing_supervisor"] as const) {
      const res = await call(listRecipesHandler, "GET", "/api/recipes", { cookie: await loginAs(role) });
      expect(res.status).toBe(200);
    }
    expect((await call(listRecipesHandler, "GET", "/api/recipes")).status).toBe(401);
  });

  it("returns recipe details with components in recipe order", async () => {
    const id = recipeIds["REC-BL01"];
    const { body } = await call(getRecipeHandler, "GET", `/api/recipes/${id}`, { cookie, params: { id } });
    expect(body.recipe.components.map((c: { componentName: string }) => c.componentName)).toEqual([
      "Front Body Panel",
      "Back Body Panel",
      "Sleeves (left and right)",
      "Collar & Stand",
      "Sleeve Cuffs",
    ]);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const unknown = randomUUID();
    expect((await call(getRecipeHandler, "GET", `/api/recipes/${unknown}`, { cookie, params: { id: unknown } })).status).toBe(404);
    expect((await call(getRecipeHandler, "GET", "/api/recipes/1 OR 1=1", { cookie, params: { id: "1 OR 1=1" } })).status).toBe(404);
  });
});

describe("server-side component multiplier", () => {
  it("50 Casual Blouses → 50, 50, 100, 50, 100 and 90 yd of fabric", async () => {
    const { status, body } = await breakdown(recipeIds["REC-BL01"], "50");
    expect(status).toBe(200);
    expect(body.breakdown.components.map((c: { expectedQty: number }) => c.expectedQty)).toEqual([50, 50, 100, 50, 100]);
    expect(body.breakdown.totalPieces).toBe(350);
    expect(body.breakdown.expectedFabricYds).toBe(90);
  });

  it("50 Crop Tops → 50, 50, 50, 50, 100 and 55 yd of fabric", async () => {
    const { body } = await breakdown(recipeIds["REC-CT02"], "50");
    expect(body.breakdown.components.map((c: { componentName: string; expectedQty: number }) => [c.componentName, c.expectedQty])).toEqual([
      ["Front Chest Panel", 50],
      ["Back Support Panel", 50],
      ["Neck Binding Strip", 50],
      ["Hem Elastic Casing", 50],
      ["Side Strap Accents", 100],
    ]);
    expect(body.breakdown.expectedFabricYds).toBe(55);
  });

  it.each(["0", "-5", "1.5", "abc", "", "1e3", "100001", "99999999999"])("rejects invalid quantity %j with 400", async (qty) => {
    const { status, body } = await breakdown(recipeIds["REC-BL01"], qty);
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
