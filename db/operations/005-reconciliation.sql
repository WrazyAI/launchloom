BEGIN;
ALTER TABLE launchloom_operations.generation_attempts
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS github_conclusion text,
  ADD COLUMN IF NOT EXISTS delivery_state text NOT NULL DEFAULT 'none' CHECK (delivery_state IN ('none', 'preview_ready'));
ALTER TABLE launchloom_operations.stage_events
  ADD COLUMN IF NOT EXISTS build_sha text CHECK (build_sha ~ '^[a-f0-9]{40}$');
CREATE TABLE IF NOT EXISTS launchloom_operations.operator_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES launchloom_operations.generation_attempts(id),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision text NOT NULL CHECK (decision = 'retain_attention'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[a-f0-9]{40,64}$'),
  repository_id text, run_id text, run_attempt integer,
  checked_conclusion text,
  side_effect_decision text NOT NULL DEFAULT 'unproven_no_retry' CHECK (side_effect_decision = 'unproven_no_retry')
);
REVOKE ALL ON launchloom_operations.operator_resolutions FROM PUBLIC;
CREATE INDEX IF NOT EXISTS attempts_reconciliation ON launchloom_operations.generation_attempts(reconciled_at NULLS FIRST, id);

CREATE OR REPLACE FUNCTION launchloom_operations.append_run_event(
  p_attempt uuid, p_repository text, p_run text, p_attempt_number integer,
  p_event_key text, p_stage text, p_transition text, p_occurred_at timestamptz,
  p_detail_code text, p_provider text, p_model text, p_cost_kind text,
  p_amount numeric, p_currency text, p_build_sha text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
DECLARE v_existing launchloom_operations.stage_events%ROWTYPE;
BEGIN
  -- Late evidence is retained for its exact owner but never changes execution
  -- state. Reconciliation separately requires GitHub success AND handoff.
  PERFORM 1 FROM launchloom_operations.generation_attempts a
    WHERE a.id = p_attempt AND a.workflow_repository = p_repository
      AND a.workflow_run_id = p_run AND a.workflow_run_attempt = p_attempt_number
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'attention'; END IF;
  IF p_event_key IS NULL OR p_event_key !~ '^[A-Za-z0-9:._/-]{1,200}$'
    OR p_stage IS NULL OR p_stage !~ '^[a-z0-9_]{1,80}$'
    OR p_transition IS NULL OR p_transition NOT IN ('started', 'completed', 'failed', 'cancelled', 'observed')
    OR (p_detail_code IS NOT NULL AND p_detail_code !~ '^[a-z0-9_]{1,80}$')
    OR (p_provider IS NOT NULL AND p_provider !~ '^[A-Za-z0-9._:/-]{1,120}$')
    OR (p_model IS NOT NULL AND p_model !~ '^[A-Za-z0-9._:/-]{1,120}$')
    OR (p_stage = 'handoff' AND (p_transition <> 'completed' OR p_build_sha IS NULL OR p_build_sha !~ '^[a-f0-9]{40}$'))
    OR (p_stage <> 'handoff' AND p_build_sha IS NOT NULL)
    OR (p_occurred_at IS NOT NULL AND NOT isfinite(p_occurred_at))
  THEN RAISE EXCEPTION 'invalid_event'; END IF;
  SELECT * INTO v_existing FROM launchloom_operations.stage_events WHERE attempt_id = p_attempt AND event_key = p_event_key;
  IF FOUND THEN
    -- Occurred-at is not part of idempotent semantic identity: retry clocks vary.
    IF v_existing.stage IS DISTINCT FROM p_stage OR v_existing.transition IS DISTINCT FROM p_transition
      OR v_existing.build_sha IS DISTINCT FROM p_build_sha OR v_existing.detail_code IS DISTINCT FROM p_detail_code
      OR v_existing.provider IS DISTINCT FROM p_provider OR v_existing.model IS DISTINCT FROM p_model
      OR v_existing.cost_kind IS DISTINCT FROM coalesce(p_cost_kind, 'unreported')
      OR v_existing.amount IS DISTINCT FROM p_amount OR v_existing.currency IS DISTINCT FROM p_currency
    THEN RAISE EXCEPTION 'event_conflict'; END IF;
    RETURN 'duplicate';
  END IF;
  INSERT INTO launchloom_operations.stage_events(attempt_id, event_key, stage, transition, occurred_at, detail_code, provider, model, cost_kind, amount, currency, build_sha)
  VALUES (p_attempt, p_event_key, p_stage, p_transition, coalesce(p_occurred_at, clock_timestamp()), p_detail_code, p_provider, p_model, coalesce(p_cost_kind, 'unreported'), p_amount, p_currency, p_build_sha);
  RETURN 'inserted';
END $$;
-- Compatibility arity delegates all validation and cannot attest a handoff.
CREATE OR REPLACE FUNCTION launchloom_operations.append_run_event(
  p_attempt uuid, p_repository text, p_run text, p_attempt_number integer,
  p_event_key text, p_stage text, p_transition text, p_occurred_at timestamptz,
  p_detail_code text, p_provider text, p_model text, p_cost_kind text,
  p_amount numeric, p_currency text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT launchloom_operations.append_run_event(p_attempt, p_repository, p_run, p_attempt_number, p_event_key, p_stage, p_transition, p_occurred_at, p_detail_code, p_provider, p_model, p_cost_kind, p_amount, p_currency, NULL);
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.get_reconciliation_attempt(p_id uuid)
RETURNS TABLE(attempt_id uuid, repository_id text, run_id text, run_attempt integer, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT id, workflow_repository, workflow_run_id, workflow_run_attempt, state FROM launchloom_operations.generation_attempts WHERE id = p_id;
$$;
CREATE OR REPLACE FUNCTION launchloom_operations.list_reconciliation_attempts()
RETURNS TABLE(attempt_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT a.id FROM launchloom_operations.generation_attempts a
  JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  WHERE a.state NOT IN ('succeeded', 'failed', 'cancelled')
    AND (a.workflow_run_id IS NOT NULL OR (o.state IN ('dispatched', 'attention') AND o.created_at < now() - interval '10 minutes'))
    AND (a.reconciled_at IS NULL OR a.reconciled_at < now() - interval '5 minutes')
  ORDER BY a.reconciled_at NULLS FIRST, a.id LIMIT 25;
$$;
CREATE OR REPLACE FUNCTION launchloom_operations.record_run_observation(
  p_id uuid, p_repository text, p_run text, p_attempt integer, p_conclusion text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
DECLARE a launchloom_operations.generation_attempts%ROWTYPE; v_state text; v_reason text; v_delivery text := 'none';
BEGIN
  IF p_conclusion IS NULL OR p_conclusion NOT IN ('unknown', 'pending', 'success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale', 'startup_failure') THEN RAISE EXCEPTION 'invalid_observation'; END IF;
  SELECT * INTO a FROM launchloom_operations.generation_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unchanged'; END IF;
  -- A stale HTTP result cannot overwrite another owner or an operator change.
  IF a.workflow_repository IS DISTINCT FROM p_repository OR a.workflow_run_id IS DISTINCT FROM p_run OR a.workflow_run_attempt IS DISTINCT FROM p_attempt THEN RETURN 'attention'; END IF;
  UPDATE launchloom_operations.generation_attempts SET reconciled_at = clock_timestamp() WHERE id = p_id;
  IF a.state IN ('succeeded', 'failed', 'cancelled') THEN RETURN 'unchanged'; END IF;
  IF p_run IS NULL THEN v_state := 'attention'; v_reason := 'unknown_run';
  ELSIF p_conclusion = 'unknown' THEN v_state := 'attention'; v_reason := 'observation_unavailable';
  ELSIF p_conclusion = 'pending' THEN
    -- Observation failures recover to running only when we see this exact owner.
    IF a.terminal_reason IS NOT NULL AND a.terminal_reason NOT IN ('observation_unavailable') THEN RETURN 'attention'; END IF;
    v_state := 'running'; v_reason := NULL;
  ELSIF p_conclusion = 'success' THEN
    IF EXISTS (SELECT 1 FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND stage = 'handoff' AND transition = 'completed' AND build_sha IS NOT NULL) THEN
      v_state := 'succeeded'; v_reason := 'verified_handoff'; v_delivery := 'preview_ready';
    ELSE v_state := 'attention'; v_reason := 'missing_handoff'; END IF;
  ELSIF p_conclusion = 'cancelled' THEN v_state := 'cancelled'; v_reason := 'github_cancelled';
  ELSE v_state := 'failed'; v_reason := 'github_' || p_conclusion;
  END IF;
  UPDATE launchloom_operations.generation_attempts SET state = v_state, terminal_reason = v_reason,
    delivery_state = v_delivery,
    github_conclusion = CASE WHEN p_conclusion IN ('pending', 'unknown') THEN github_conclusion ELSE p_conclusion END,
    finished_at = CASE WHEN p_conclusion NOT IN ('pending', 'unknown') THEN coalesce(finished_at, clock_timestamp()) ELSE finished_at END
    WHERE id = p_id;
  IF v_state = 'attention' THEN RETURN 'attention'; END IF;
  IF a.state = v_state AND a.terminal_reason IS NOT DISTINCT FROM v_reason THEN RETURN 'unchanged'; END IF;
  RETURN 'updated';
END $$;

CREATE OR REPLACE FUNCTION launchloom_operations.retain_attention(p_id uuid, p_actor text, p_evidence text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
DECLARE a launchloom_operations.generation_attempts%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR length(p_actor) NOT BETWEEN 1 AND 200 OR p_actor ~ '[[:cntrl:]]' OR p_evidence IS NULL OR p_evidence !~ '^[a-f0-9]{40,64}$' THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  SELECT * INTO a FROM launchloom_operations.generation_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR a.state <> 'attention' THEN RETURN 'unchanged'; END IF;
  INSERT INTO launchloom_operations.operator_resolutions(attempt_id, actor_id, decision, evidence_ref, repository_id, run_id, run_attempt, checked_conclusion)
    VALUES (p_id, p_actor, 'retain_attention', p_evidence, a.workflow_repository, a.workflow_run_id, a.workflow_run_attempt, a.github_conclusion);
  RETURN 'attention';
END $$;

CREATE OR REPLACE FUNCTION launchloom_operations.attempt_cost_rollup(p_id uuid)
RETURNS TABLE(currency text, actual text, estimated text, unreported bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT c.currency,
    coalesce(sum(e.amount) FILTER (WHERE e.cost_kind = 'actual'), 0)::numeric(20,8)::text,
    coalesce(sum(e.amount) FILTER (WHERE e.cost_kind = 'estimated'), 0)::numeric(20,8)::text,
    (SELECT count(*) FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND cost_kind = 'unreported')
  FROM (SELECT DISTINCT currency FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND currency IS NOT NULL
    UNION ALL SELECT NULL::text WHERE NOT EXISTS (SELECT 1 FROM launchloom_operations.stage_events WHERE attempt_id = p_id AND currency IS NOT NULL)) c
  LEFT JOIN launchloom_operations.stage_events e ON e.attempt_id = p_id AND e.currency = c.currency
  GROUP BY c.currency;
$$;
CREATE OR REPLACE FUNCTION launchloom_operations.operation_alerts()
RETURNS TABLE("attemptId" uuid, code text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT a.id, CASE
    WHEN a.state IN ('failed', 'cancelled') THEN 'execution_failed'
    WHEN a.state = 'attention' THEN coalesce(a.terminal_reason, 'operator_attention')
    WHEN o.retry_count >= 3 THEN 'repeated_dispatch_failure'
    WHEN a.state = 'running' AND a.started_at < now() - interval '2 hours' THEN 'aging_run'
    WHEN a.state = 'waiting_to_start' AND a.created_at < now() - interval '10 minutes' THEN 'aging_outbox'
    ELSE 'incomplete_events' END
  FROM launchloom_operations.generation_attempts a JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  WHERE a.state IN ('failed', 'cancelled', 'attention') OR o.retry_count >= 3
    OR (a.state = 'running' AND (a.started_at < now() - interval '2 hours' OR NOT EXISTS (SELECT 1 FROM launchloom_operations.stage_events e WHERE e.attempt_id = a.id AND e.recorded_at > now() - interval '30 minutes')))
    OR (a.state = 'waiting_to_start' AND a.created_at < now() - interval '10 minutes')
  ORDER BY a.created_at, a.id LIMIT 100;
$$;

-- Trusted Worker service functions only. No direct table privileges, browser DB
-- credentials, public execution, or membership-role inheritance are introduced.
REVOKE ALL ON FUNCTION launchloom_operations.append_run_event(uuid,text,text,integer,text,text,text,timestamptz,text,text,text,text,numeric,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.get_reconciliation_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.list_reconciliation_attempts() FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.record_run_observation(uuid,text,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.retain_attention(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.attempt_cost_rollup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.operation_alerts() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.append_run_event(uuid,text,text,integer,text,text,text,timestamptz,text,text,text,text,numeric,text,text) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_reconciliation_attempt(uuid) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.list_reconciliation_attempts() TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.record_run_observation(uuid,text,text,integer,text) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.retain_attention(uuid,text,text) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.attempt_cost_rollup(uuid) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.operation_alerts() TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
