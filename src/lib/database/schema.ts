/**
 * ApparelFlow relational schema (PostgreSQL, Drizzle ORM).
 *
 * Integrity rules that must never depend on application code alone are
 * expressed here as CHECK / UNIQUE / FOREIGN KEY constraints. Append-only
 * audit tables are additionally protected by triggers (see the custom
 * migration `0001_audit_immutability.sql`).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["cutting_supervisor", "cutting_verifier", "sewing_supervisor"]);

export const orderStatus = pgEnum("order_status", ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"]);

export const componentStatus = pgEnum("component_status", ["GREEN", "YELLOW", "RED"]);

export const verificationDecision = pgEnum("verification_decision", ["APPROVED", "REJECTED"]);

export const sewingStatus = pgEnum("sewing_status", ["IN_PROGRESS"]);

export const auditEventType = pgEnum("audit_event_type", [
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "ORDER_CREATED",
  "COUNTS_RECORDED",
  "ORDER_APPROVED",
  "ORDER_REJECTED",
  "RECUT_SUBMITTED",
  "SEWING_STARTED",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 hex digest of the opaque session token. The raw token only ever lives in the cookie. */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeCode: varchar("recipe_code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    stdFabricYards: numeric("std_fabric_yards", { precision: 6, scale: 2, mode: "number" }).notNull(),
    /** Wastage cap as a percentage, e.g. 5.00 = 5%. Informational: it is displayed and recorded, never used to block approval. */
    wastageCap: numeric("wastage_cap", { precision: 5, scale: 2, mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("recipes_recipe_code_unique").on(t.recipeCode),
    check("recipes_std_fabric_positive", sql`${t.stdFabricYards} > 0`),
    check("recipes_wastage_cap_range", sql`${t.wastageCap} >= 0 AND ${t.wastageCap} <= 100`),
  ],
);

export const recipeComponents = pgTable(
  "recipe_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "restrict" }),
    componentName: varchar("component_name", { length: 120 }).notNull(),
    piecesPerGarment: integer("pieces_per_garment").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("recipe_components_recipe_name_unique").on(t.recipeId, t.componentName),
    check("recipe_components_pieces_positive", sql`${t.piecesPerGarment} > 0`),
  ],
);

export const cuttingOrderNoSeq = pgSequence("cutting_order_no_seq", { startWith: 1, increment: 1 });

export const cuttingOrders = pgTable(
  "cutting_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: varchar("order_no", { length: 32 }).notNull(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "restrict" }),
    targetQty: integer("target_qty").notNull(),
    fabricRollId: varchar("fabric_roll_id", { length: 64 }).notNull(),
    actualFabricYds: numeric("actual_fabric_yds", { precision: 10, scale: 2, mode: "number" }).notNull(),
    status: orderStatus("status").notNull().default("PENDING_VERIFICATION"),
    /** Verification attempt currently open or last decided. Incremented by each re-cut. */
    currentAttempt: integer("current_attempt").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Client-generated key that makes order submission idempotent per supervisor. */
    idempotencyKey: uuid("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("cutting_orders_order_no_unique").on(t.orderNo),
    unique("cutting_orders_idempotency_unique").on(t.createdBy, t.idempotencyKey),
    check("cutting_orders_target_qty_range", sql`${t.targetQty} > 0 AND ${t.targetQty} <= 100000`),
    check("cutting_orders_fabric_non_negative", sql`${t.actualFabricYds} >= 0`),
    check("cutting_orders_attempt_positive", sql`${t.currentAttempt} >= 1`),
    index("cutting_orders_status_created_idx").on(t.status, t.createdAt),
    index("cutting_orders_recipe_idx").on(t.recipeId),
    index("cutting_orders_created_by_idx").on(t.createdBy),
  ],
);

export const verificationItems = pgTable(
  "verification_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "restrict" }),
    attemptNo: integer("attempt_no").notNull(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => recipeComponents.id, { onDelete: "restrict" }),
    expectedQty: integer("expected_qty").notNull(),
    actualQty: integer("actual_qty"),
    status: componentStatus("status"),
    countedBy: uuid("counted_by").references(() => users.id, { onDelete: "restrict" }),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("verification_items_order_attempt_component_unique").on(t.orderId, t.attemptNo, t.componentId),
    check("verification_items_expected_positive", sql`${t.expectedQty} > 0`),
    check("verification_items_actual_non_negative", sql`${t.actualQty} IS NULL OR ${t.actualQty} >= 0`),
    // A count and its traffic-light status exist together or not at all: an uncounted item is never "GREEN".
    check("verification_items_status_iff_counted", sql`(${t.actualQty} IS NULL) = (${t.status} IS NULL)`),
    check(
      "verification_items_status_consistent",
      sql`${t.actualQty} IS NULL
        OR (${t.actualQty} = ${t.expectedQty} AND ${t.status} = 'GREEN')
        OR (${t.actualQty} > ${t.expectedQty} AND ${t.status} = 'YELLOW')
        OR (${t.actualQty} < ${t.expectedQty} AND ${t.status} = 'RED')`,
    ),
    index("verification_items_order_attempt_idx").on(t.orderId, t.attemptNo),
  ],
);

export type ComponentVarianceSnapshot = {
  componentId: string;
  componentName: string;
  piecesPerGarment: number;
  expectedQty: number;
  actualQty: number | null;
  variance: number | null;
  status: "GREEN" | "YELLOW" | "RED" | null;
};

export const verificationLogs = pgTable(
  "verification_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "restrict" }),
    attemptNo: integer("attempt_no").notNull(),
    verifierId: uuid("verifier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: verificationDecision("decision").notNull(),
    rejectionNote: text("rejection_note"),
    expectedFabricYds: numeric("expected_fabric_yds", { precision: 10, scale: 2, mode: "number" }).notNull(),
    actualFabricYds: numeric("actual_fabric_yds", { precision: 10, scale: 2, mode: "number" }).notNull(),
    /** Positive = over-consumption, negative = fabric saved versus the standard. */
    wastagePct: numeric("wastage_pct", { precision: 8, scale: 2, mode: "number" }).notNull(),
    wastageCapPct: numeric("wastage_cap_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    fabricRollId: varchar("fabric_roll_id", { length: 64 }).notNull(),
    componentVariances: jsonb("component_variances").$type<ComponentVarianceSnapshot[]>().notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One decision per verification attempt: duplicate/concurrent approvals cannot create a second record.
    unique("verification_logs_order_attempt_unique").on(t.orderId, t.attemptNo),
    check(
      "verification_logs_rejection_note_rule",
      sql`(${t.decision} = 'APPROVED' AND ${t.rejectionNote} IS NULL)
        OR (${t.decision} = 'REJECTED' AND ${t.rejectionNote} IS NOT NULL AND char_length(btrim(${t.rejectionNote})) >= 5)`,
    ),
    check("verification_logs_attempt_positive", sql`${t.attemptNo} >= 1`),
    index("verification_logs_verifier_idx").on(t.verifierId),
    index("verification_logs_timestamp_idx").on(t.timestamp),
  ],
);

export const sewingOperations = pgTable(
  "sewing_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "restrict" }),
    status: sewingStatus("status").notNull().default("IN_PROGRESS"),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sewing_operations_order_unique").on(t.orderId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Monotonic insertion order. Events in one transaction share now(), so seq is the reliable tie-breaker. */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    eventType: auditEventType("event_type").notNull(),
    orderId: uuid("order_id").references(() => cuttingOrders.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "restrict" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_order_idx").on(t.orderId, t.seq),
    unique("audit_events_seq_unique").on(t.seq),
    index("audit_events_type_idx").on(t.eventType, t.occurredAt),
  ],
);

export type UserRole = (typeof userRole.enumValues)[number];
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type ComponentStatus = (typeof componentStatus.enumValues)[number];
export type AuditEventType = (typeof auditEventType.enumValues)[number];
