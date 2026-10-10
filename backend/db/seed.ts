/**
 * Idempotent seed: production recipes + one demo user per role.
 * Safe to re-run — recipes/components/users are upserted on their natural keys.
 * Shared by `npm run db:seed` and the integration-test harness.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "../services/auth/password";
import * as schema from "./schema";
import { recipeComponents, recipes, users, type UserRole } from "./schema";

type SeedDb = PostgresJsDatabase<typeof schema>;

export const SEED_RECIPES = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    stdFabricYards: 1.8,
    wastageCap: 5,
    components: [
      { componentName: "Front Body Panel", piecesPerGarment: 1 },
      { componentName: "Back Body Panel", piecesPerGarment: 1 },
      { componentName: "Sleeves (left and right)", piecesPerGarment: 2 },
      { componentName: "Collar & Stand", piecesPerGarment: 1 },
      { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
    ],
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    stdFabricYards: 1.1,
    wastageCap: 8,
    components: [
      { componentName: "Front Chest Panel", piecesPerGarment: 1 },
      { componentName: "Back Support Panel", piecesPerGarment: 1 },
      { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
      { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
      { componentName: "Side Strap Accents", piecesPerGarment: 2 },
    ],
  },
] as const;

/** One account per role. Passwords are never in code: they are supplied to `runSeed` (from env vars). */
export const SEED_USERS: readonly { email: string; fullName: string; role: UserRole }[] = [
  { email: "nimal.perera@apparelflow.lk", fullName: "Nimal Perera", role: "cutting_supervisor" },
  { email: "kavindi.silva@apparelflow.lk", fullName: "Kavindi Silva", role: "cutting_verifier" },
  { email: "ruwan.fernando@apparelflow.lk", fullName: "Ruwan Fernando", role: "sewing_supervisor" },
];

export type SeedPasswords = Record<UserRole, string>;

export async function runSeed(db: SeedDb, options: { passwords: SeedPasswords }): Promise<void> {
  const hashes = new Map<UserRole, string>();
  for (const u of SEED_USERS) {
    const password = options.passwords[u.role];
    if (!password || password.length < 10) throw new Error(`Password for ${u.role} must be at least 10 characters`);
    hashes.set(u.role, await hashPassword(password));
  }

  await db.transaction(async (tx) => {
    for (const r of SEED_RECIPES) {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          recipeCode: r.recipeCode,
          name: r.name,
          category: r.category,
          stdFabricYards: r.stdFabricYards,
          wastageCap: r.wastageCap,
        })
        .onConflictDoUpdate({
          target: recipes.recipeCode,
          set: {
            name: r.name,
            category: r.category,
            stdFabricYards: r.stdFabricYards,
            wastageCap: r.wastageCap,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: recipes.id });

      for (const [index, c] of r.components.entries()) {
        await tx
          .insert(recipeComponents)
          .values({ recipeId: recipe.id, componentName: c.componentName, piecesPerGarment: c.piecesPerGarment, sortOrder: index })
          .onConflictDoUpdate({
            target: [recipeComponents.recipeId, recipeComponents.componentName],
            set: { piecesPerGarment: c.piecesPerGarment, sortOrder: index },
          });
      }
    }

    for (const u of SEED_USERS) {
      const passwordHash = hashes.get(u.role)!;
      await tx
        .insert(users)
        .values({ email: u.email, fullName: u.fullName, role: u.role, passwordHash })
        .onConflictDoUpdate({
          target: users.email,
          set: { fullName: u.fullName, role: u.role, passwordHash, updatedAt: sql`now()` },
        });
    }
  });
}
