CREATE TYPE "public"."audit_event_type" AS ENUM('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ORDER_CREATED', 'COUNTS_RECORDED', 'ORDER_APPROVED', 'ORDER_REJECTED', 'RECUT_SUBMITTED', 'SEWING_STARTED');--> statement-breakpoint
CREATE TYPE "public"."component_status" AS ENUM('GREEN', 'YELLOW', 'RED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."sewing_status" AS ENUM('IN_PROGRESS');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor');--> statement-breakpoint
CREATE TYPE "public"."verification_decision" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE SEQUENCE "public"."cutting_order_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "audit_event_type" NOT NULL,
	"order_id" uuid,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutting_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(32) NOT NULL,
	"recipe_id" uuid NOT NULL,
	"target_qty" integer NOT NULL,
	"fabric_roll_id" varchar(64) NOT NULL,
	"actual_fabric_yds" numeric(10, 2) NOT NULL,
	"status" "order_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"current_attempt" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cutting_orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "cutting_orders_idempotency_unique" UNIQUE("created_by","idempotency_key"),
	CONSTRAINT "cutting_orders_target_qty_range" CHECK ("cutting_orders"."target_qty" > 0 AND "cutting_orders"."target_qty" <= 100000),
	CONSTRAINT "cutting_orders_fabric_non_negative" CHECK ("cutting_orders"."actual_fabric_yds" >= 0),
	CONSTRAINT "cutting_orders_attempt_positive" CHECK ("cutting_orders"."current_attempt" >= 1)
);
--> statement-breakpoint
CREATE TABLE "recipe_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"component_name" varchar(120) NOT NULL,
	"pieces_per_garment" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_components_recipe_name_unique" UNIQUE("recipe_id","component_name"),
	CONSTRAINT "recipe_components_pieces_positive" CHECK ("recipe_components"."pieces_per_garment" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(60) NOT NULL,
	"std_fabric_yards" numeric(6, 2) NOT NULL,
	"wastage_cap" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_recipe_code_unique" UNIQUE("recipe_code"),
	CONSTRAINT "recipes_std_fabric_positive" CHECK ("recipes"."std_fabric_yards" > 0),
	CONSTRAINT "recipes_wastage_cap_range" CHECK ("recipes"."wastage_cap" >= 0 AND "recipes"."wastage_cap" <= 100)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sewing_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "sewing_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_by" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sewing_operations_order_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "verification_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"component_id" uuid NOT NULL,
	"expected_qty" integer NOT NULL,
	"actual_qty" integer,
	"status" "component_status",
	"counted_by" uuid,
	"counted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_items_order_attempt_component_unique" UNIQUE("order_id","attempt_no","component_id"),
	CONSTRAINT "verification_items_expected_positive" CHECK ("verification_items"."expected_qty" > 0),
	CONSTRAINT "verification_items_actual_non_negative" CHECK ("verification_items"."actual_qty" IS NULL OR "verification_items"."actual_qty" >= 0),
	CONSTRAINT "verification_items_status_iff_counted" CHECK (("verification_items"."actual_qty" IS NULL) = ("verification_items"."status" IS NULL)),
	CONSTRAINT "verification_items_status_consistent" CHECK ("verification_items"."actual_qty" IS NULL
        OR ("verification_items"."actual_qty" = "verification_items"."expected_qty" AND "verification_items"."status" = 'GREEN')
        OR ("verification_items"."actual_qty" > "verification_items"."expected_qty" AND "verification_items"."status" = 'YELLOW')
        OR ("verification_items"."actual_qty" < "verification_items"."expected_qty" AND "verification_items"."status" = 'RED'))
);
--> statement-breakpoint
CREATE TABLE "verification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"verifier_id" uuid NOT NULL,
	"decision" "verification_decision" NOT NULL,
	"rejection_note" text,
	"expected_fabric_yds" numeric(10, 2) NOT NULL,
	"actual_fabric_yds" numeric(10, 2) NOT NULL,
	"wastage_pct" numeric(8, 2) NOT NULL,
	"wastage_cap_pct" numeric(5, 2) NOT NULL,
	"fabric_roll_id" varchar(64) NOT NULL,
	"component_variances" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_logs_order_attempt_unique" UNIQUE("order_id","attempt_no"),
	CONSTRAINT "verification_logs_rejection_note_rule" CHECK (("verification_logs"."decision" = 'APPROVED' AND "verification_logs"."rejection_note" IS NULL)
        OR ("verification_logs"."decision" = 'REJECTED' AND "verification_logs"."rejection_note" IS NOT NULL AND char_length(btrim("verification_logs"."rejection_note")) >= 5)),
	CONSTRAINT "verification_logs_attempt_positive" CHECK ("verification_logs"."attempt_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sewing_operations" ADD CONSTRAINT "sewing_operations_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sewing_operations" ADD CONSTRAINT "sewing_operations_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_component_id_recipe_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."recipe_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_verifier_id_users_id_fk" FOREIGN KEY ("verifier_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_order_idx" ON "audit_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_type_idx" ON "audit_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "cutting_orders_status_created_idx" ON "cutting_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "cutting_orders_recipe_idx" ON "cutting_orders" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "cutting_orders_created_by_idx" ON "cutting_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_items_order_attempt_idx" ON "verification_items" USING btree ("order_id","attempt_no");--> statement-breakpoint
CREATE INDEX "verification_logs_verifier_idx" ON "verification_logs" USING btree ("verifier_id");--> statement-breakpoint
CREATE INDEX "verification_logs_timestamp_idx" ON "verification_logs" USING btree ("timestamp");