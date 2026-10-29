-- Run-owned reads and stage writes. Apply only to an explicitly approved target
-- as a trusted schema owner. These are service-only functions, not public APIs.
-- Every function requires the exact verified GitHub run identity; a caller that
-- merely knows an opaque ID cannot read private intake content or write events.
BEGIN;

CREATE OR REPLACE FUNCTION launchloom_operations.get_claimed_operation(
  p_operation uuid, p_repository text, p_run text, p_attempt integer
)
RETURNS TABLE (operation_id uuid, intake_id uuid, request_id uuid, attempt_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
  SELECT o.id, o.intake_id, o.request_id, o.attempt_id
  FROM launchloom_operations.dispatch_outbox o
  JOIN launchloom_operations.intakes i ON i.id = o.intake_id
  JOIN launchloom_operations.generation_attempts a ON a.id = o.attempt_id
  WHERE o.id = p_operation
    AND i.acceptance_state = 'confirmed'
    AND o.state = 'dispatched'
    AND a.state = 'running'
    AND a.workflow_repository = p_repository
    AND a.workflow_run_id = p_run
    AND a.workflow_run_attempt = p_attempt;
$$;

-- The legacy get_intake(uuid) remains a trusted internal read for acceptance
-- recovery. Workflow callers must use this identity-bound function instead.
CREATE OR REPLACE FUNCTION launchloom_operations.get_claimed_intake(
  p_intake uuid, p_repository text, p_run text, p_attempt integer
)
RETURNS TABLE (record jsonb) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
  SELECT jsonb_build_object('schemaVersion', 1, 'intakeId', i.id, 'clientId', i.client_id,
    'inviteId', i.invite_id, 'submissionId', i.submission_id, 'fingerprint', i.fingerprint,
    'payloadVersion', i.payload_version, 'payload', i.payload, 'consent', i.consent,
    'acceptanceState', i.acceptance_state, 'receivedAt', i.received_at, 'confirmedAt', i.confirmed_at,
    'requestId', r.id, 'attemptId', a.id, 'operationId', o.id, 'profile', r.profile)
  FROM launchloom_operations.intakes i
  JOIN launchloom_operations.generation_requests r ON r.intake_id = i.id AND r.idempotency_key = 'initial'
  JOIN launchloom_operations.generation_attempts a ON a.request_id = r.id AND a.attempt_number = 1
  JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  WHERE i.id = p_intake
    AND i.acceptance_state = 'confirmed'
    AND o.state = 'dispatched'
    AND a.state = 'running'
    AND a.workflow_repository = p_repository
    AND a.workflow_run_id = p_run
    AND a.workflow_run_attempt = p_attempt;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.append_run_event(
  p_attempt uuid, p_repository text, p_run text, p_attempt_number integer,
  p_event_key text, p_stage text, p_transition text, p_occurred_at timestamptz,
  p_detail_code text, p_provider text, p_model text, p_cost_kind text,
  p_amount numeric, p_currency text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
BEGIN
  -- Identity is checked against the attempt row, not against caller input. An
  -- attempt that is not owned by this exact run gets no information about it.
  PERFORM 1 FROM launchloom_operations.generation_attempts a
    WHERE a.id = p_attempt AND a.state = 'running'
      AND a.workflow_repository = p_repository
      AND a.workflow_run_id = p_run
      AND a.workflow_run_attempt = p_attempt_number
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'attention'; END IF;
  INSERT INTO launchloom_operations.stage_events(
    attempt_id, event_key, stage, transition, occurred_at, detail_code,
    provider, model, cost_kind, amount, currency)
  VALUES (p_attempt, p_event_key, p_stage, p_transition,
    coalesce(p_occurred_at, clock_timestamp()), p_detail_code,
    p_provider, p_model, coalesce(p_cost_kind, 'unreported'), p_amount, p_currency)
  ON CONFLICT (attempt_id, event_key) DO NOTHING;
  IF FOUND THEN RETURN 'inserted'; END IF;
  RETURN 'duplicate';
END;
$$;

REVOKE ALL ON FUNCTION launchloom_operations.get_claimed_operation(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.get_claimed_intake(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.append_run_event(uuid, text, text, integer, text, text, text, timestamptz, text, text, text, text, numeric, text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_claimed_operation(uuid, text, text, integer) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_claimed_intake(uuid, text, text, integer) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.append_run_event(uuid, text, text, integer, text, text, text, timestamptz, text, text, text, text, numeric, text) TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
