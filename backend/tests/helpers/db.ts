import { sql } from "drizzle-orm";
import { db } from "@backend/db/client";

/** Removes all transactional data while keeping seeded recipes and users. TRUNCATE bypasses row-level audit triggers by design. */
export async function resetTransactionalData(): Promise<void> {
  await db().execute(
    sql`TRUNCATE sewing_operations, verification_logs, verification_items, audit_events, sessions, cutting_orders RESTART IDENTITY CASCADE`,
  );
}
