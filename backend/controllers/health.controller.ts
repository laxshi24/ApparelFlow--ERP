import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@backend/db/client";
import { apiHandler } from "@backend/middleware/api-handler";
import { logger, serializeError } from "@backend/utils/logger";

/** Liveness + database readiness. Reports no configuration details beyond up/down. */
export const GET = apiHandler(async (request) => {
  // Reading the request marks this handler dynamic, so it is never prerendered at build time.
  void request.headers;
  const startedAt = Date.now();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "up", latencyMs: Date.now() - startedAt });
  } catch (err) {
    logger.error("health.database_unreachable", serializeError(err));
    return Response.json({ status: "degraded", database: "down" }, { status: 503 });
  }
});
