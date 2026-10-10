-- Defense in depth: invariants enforced by PostgreSQL itself, independent of application code.

-- 1. Append-only audit tables -------------------------------------------------
CREATE OR REPLACE FUNCTION apparelflow_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER verification_logs_append_only
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION apparelflow_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION apparelflow_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER sewing_operations_no_delete
  BEFORE DELETE ON sewing_operations
  FOR EACH ROW EXECUTE FUNCTION apparelflow_reject_mutation();
--> statement-breakpoint

-- 2. Cutting order status state machine --------------------------------------
--   INSERT                       -> PENDING_VERIFICATION (attempt 1)
--   PENDING_VERIFICATION         -> VERIFIED  (APPROVED log for the attempt, every item counted, no shortage)
--   PENDING_VERIFICATION         -> REJECTED  (REJECTED log for the attempt)
--   REJECTED                     -> PENDING_VERIFICATION (re-cut: attempt + 1)
--   VERIFIED                     -> (terminal)
CREATE OR REPLACE FUNCTION apparelflow_guard_order_status() RETURNS trigger AS $$
DECLARE
  missing_or_short integer;
  item_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING_VERIFICATION' OR NEW.current_attempt <> 1 THEN
      RAISE EXCEPTION 'New cutting orders must start as PENDING_VERIFICATION attempt 1'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status AND NEW.current_attempt = OLD.current_attempt THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PENDING_VERIFICATION' AND NEW.status = 'VERIFIED' AND NEW.current_attempt = OLD.current_attempt THEN
    IF NOT EXISTS (
      SELECT 1 FROM verification_logs
      WHERE order_id = NEW.id AND attempt_no = NEW.current_attempt AND decision = 'APPROVED'
    ) THEN
      RAISE EXCEPTION 'Order % cannot be VERIFIED without an APPROVED verification log', NEW.order_no
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*), count(*) FILTER (WHERE actual_qty IS NULL OR actual_qty < expected_qty)
      INTO item_count, missing_or_short
      FROM verification_items
      WHERE order_id = NEW.id AND attempt_no = NEW.current_attempt;
    IF item_count = 0 OR missing_or_short > 0 THEN
      RAISE EXCEPTION 'Order % cannot be VERIFIED with missing or short component counts', NEW.order_no
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'PENDING_VERIFICATION' AND NEW.status = 'REJECTED' AND NEW.current_attempt = OLD.current_attempt THEN
    IF NOT EXISTS (
      SELECT 1 FROM verification_logs
      WHERE order_id = NEW.id AND attempt_no = NEW.current_attempt AND decision = 'REJECTED'
    ) THEN
      RAISE EXCEPTION 'Order % cannot be REJECTED without a REJECTED verification log', NEW.order_no
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'REJECTED' AND NEW.status = 'PENDING_VERIFICATION' AND NEW.current_attempt = OLD.current_attempt + 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal cutting order transition % (attempt %) -> % (attempt %)',
    OLD.status, OLD.current_attempt, NEW.status, NEW.current_attempt
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cutting_orders_status_guard
  BEFORE INSERT OR UPDATE ON cutting_orders
  FOR EACH ROW EXECUTE FUNCTION apparelflow_guard_order_status();
--> statement-breakpoint

-- 3. Sewing can only start on VERIFIED orders --------------------------------
CREATE OR REPLACE FUNCTION apparelflow_guard_sewing_start() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cutting_orders WHERE id = NEW.order_id AND status = 'VERIFIED') THEN
    RAISE EXCEPTION 'Sewing can only start for VERIFIED cutting orders' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sewing_operations_verified_only
  BEFORE INSERT OR UPDATE ON sewing_operations
  FOR EACH ROW EXECUTE FUNCTION apparelflow_guard_sewing_start();
--> statement-breakpoint

-- 4. Verification counts are frozen once the attempt is decided ---------------
CREATE OR REPLACE FUNCTION apparelflow_guard_item_update() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification_items rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.order_id <> OLD.order_id OR NEW.attempt_no <> OLD.attempt_no
     OR NEW.component_id <> OLD.component_id OR NEW.expected_qty <> OLD.expected_qty THEN
    RAISE EXCEPTION 'Verification item identity and expected quantity are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM verification_logs WHERE order_id = OLD.order_id AND attempt_no = OLD.attempt_no) THEN
    RAISE EXCEPTION 'Counts for a decided verification attempt are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER verification_items_guard
  BEFORE UPDATE OR DELETE ON verification_items
  FOR EACH ROW EXECUTE FUNCTION apparelflow_guard_item_update();
