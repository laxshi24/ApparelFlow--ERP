DROP INDEX "audit_events_order_idx";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "audit_events_order_idx" ON "audit_events" USING btree ("order_id","seq");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_seq_unique" UNIQUE("seq");