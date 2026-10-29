BEGIN;
-- Isolated approved migration only. Decimal precision is bounded explicitly,
-- never implicitly rounded by a NUMERIC(p,s) typemod on insertion.
ALTER TABLE launchloom_operations.stage_events
  ALTER COLUMN amount TYPE numeric,
  ADD COLUMN IF NOT EXISTS coverage_complete boolean;
ALTER TABLE launchloom_operations.stage_events
  DROP CONSTRAINT IF EXISTS stage_events_decimal_bounds;
ALTER TABLE launchloom_operations.stage_events
  ADD CONSTRAINT stage_events_decimal_bounds CHECK (amount IS NULL OR
    (amount >= 0 AND amount < 100000000000000000000 AND scale(amount) <= 30));

CREATE OR REPLACE FUNCTION launchloom_operations.append_run_event(
  p_attempt uuid, p_repository text, p_run text, p_attempt_number integer,
  p_event_key text, p_stage text, p_transition text, p_occurred_at timestamptz,
  p_detail_code text, p_provider text, p_model text, p_cost_kind text,
  p_amount numeric, p_currency text, p_build_sha text, p_coverage_complete boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
DECLARE v_result text; v_coverage boolean;
BEGIN
  IF p_coverage_complete IS TRUE AND coalesce(p_cost_kind, 'unreported') = 'unreported' THEN RAISE EXCEPTION 'invalid_event'; END IF;
  -- The existing function fences and locks the attempt before insertion or
  -- duplicate checking; that lock persists through this atomic wrapper.
  v_result := launchloom_operations.append_run_event(p_attempt, p_repository, p_run,
    p_attempt_number, p_event_key, p_stage, p_transition, p_occurred_at,
    p_detail_code, p_provider, p_model, p_cost_kind, p_amount, p_currency, p_build_sha);
  IF v_result = 'duplicate' THEN
    SELECT coverage_complete INTO v_coverage FROM launchloom_operations.stage_events
      WHERE attempt_id = p_attempt AND event_key = p_event_key;
    IF v_coverage IS DISTINCT FROM p_coverage_complete THEN RAISE EXCEPTION 'event_conflict'; END IF;
  ELSIF v_result = 'inserted' THEN
    UPDATE launchloom_operations.stage_events SET coverage_complete = p_coverage_complete
      WHERE attempt_id = p_attempt AND event_key = p_event_key;
  END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION launchloom_operations.append_run_event(uuid,text,text,integer,text,text,text,timestamptz,text,text,text,text,numeric,text,text,boolean) FROM PUBLIC;

-- New coverage fields are counts, not invented dollar estimates. A known
-- actual subtotal can coexist with incomplete/unknown coverage. Preserve the
-- original subtotal fields, but do not present them as a complete bill.
-- No CASCADE: unknown downstream dependencies must block operator migration.
DROP FUNCTION launchloom_operations.attempt_cost_rollup(uuid);
CREATE FUNCTION launchloom_operations.attempt_cost_rollup(p_id uuid)
RETURNS TABLE(currency text, actual text, estimated text, unreported bigint, incomplete bigint, unknown_coverage bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT c.currency,
    coalesce(sum(e.amount) FILTER (WHERE e.cost_kind = 'actual'), 0)::text,
    coalesce(sum(e.amount) FILTER (WHERE e.cost_kind = 'estimated'), 0)::text,
    (SELECT count(*) FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND cost_kind = 'unreported'),
    (SELECT count(*) FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND coverage_complete IS FALSE),
    (SELECT count(*) FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND coverage_complete IS NULL
      AND (amount IS NOT NULL OR event_key LIKE '%:cost:%' OR event_key LIKE 'cost:%'))
  FROM (SELECT DISTINCT currency FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND currency IS NOT NULL
    UNION ALL SELECT NULL::text WHERE NOT EXISTS (SELECT 1 FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND currency IS NOT NULL)) c
  LEFT JOIN launchloom_operations.stage_events e ON e.attempt_id = p_id AND e.currency = c.currency
  GROUP BY c.currency;
$$;
REVOKE ALL ON FUNCTION launchloom_operations.attempt_cost_rollup(uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.append_run_event(uuid,text,text,integer,text,text,text,timestamptz,text,text,text,text,numeric,text,text,boolean) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.attempt_cost_rollup(uuid) TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
