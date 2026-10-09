import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/database/client";
import { apiHandler } from "@/lib/http/api-handler";
import { logger, serializeError } from "@/lib/logger";

/** Liveness + database readiness. Reports no configuration details beyond up/down. */
export const GET = apiHandler(async () => {
  const startedAt = Date.now();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "up", latencyMs: Date.now() - startedAt });
  } catch (err) {
    logger.error("health.database_unreachable", serializeError(err));
    return Response.json({ status: "degraded", database: "down" }, { status: 503 });
  }
});
