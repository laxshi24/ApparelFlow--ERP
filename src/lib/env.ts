import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required. Copy .env.example to .env and set a PostgreSQL connection string." })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// or postgresql:// connection string."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(8),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` can run without a
 * database; the first request that needs configuration fails with an actionable message.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}\nSee .env.example and README.md#environment-variables.`);
  }
  cached = parsed.data;
  return cached;
}
