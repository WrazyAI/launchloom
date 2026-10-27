-- Apply only to an explicitly approved target, as a trusted schema owner.
-- No role/login provisioning. The operator must separately supply an isolated
-- launchloom_operations_worker role with no membership/admin privileges.
-- These service-only functions are NOT browser/workflow authorization APIs.
BEGIN;
CREATE SCHEMA IF NOT EXISTS launchloom_operations;
REVOKE ALL ON SCHEMA launchloom_operations FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA launchloom_operations REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE IF NOT EXISTS launchloom_operations.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS launchloom_operations.intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES launchloom_operations.clients(id),
  invite_id text NOT NULL UNIQUE CHECK (length(invite_id) BETWEEN 1 AND 200),
  submission_id text NOT NULL CHECK (length(submission_id) BETWEEN 1 AND 200),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  payload_version integer NOT NULL CHECK (payload_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  consent jsonb NOT NULL CHECK (jsonb_typeof(consent) = 'object'
    AND consent @> '{"rightsConfirmed": true}'::jsonb
    AND coalesce(jsonb_typeof(consent->'termsVersion'), '') = 'string'
    AND coalesce(length(consent->>'termsVersion'), 0) BETWEEN 1 AND 200),
  acceptance_state text NOT NULL DEFAULT 'unconfirmed' CHECK (acceptance_state IN ('unconfirmed', 'confirmed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (invite_id, submission_id),
  CHECK ((acceptance_state = 'confirmed') = (confirmed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS launchloom_operations.generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES launchloom_operations.intakes(id),
  profile text NOT NULL CHECK (length(profile) BETWEEN 1 AND 200),
  idempotency_key text NOT NULL,
  dispatch_state text NOT NULL DEFAULT 'waiting_to_start' CHECK (dispatch_state IN ('waiting_to_start', 'dispatched', 'attention')),
  attribution text NOT NULL DEFAULT 'intake' CHECK (attribution IN ('intake', 'retry', 'diagnostic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_id, idempotency_key),
  UNIQUE (id, intake_id)
);
CREATE TABLE IF NOT EXISTS launchloom_operations.generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES launchloom_operations.generation_requests(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  state text NOT NULL DEFAULT 'waiting_to_start' CHECK (state IN ('waiting_to_start', 'running', 'succeeded', 'failed', 'cancelled', 'attention')),
  workflow_repository text,
  workflow_run_id text,
  workflow_run_attempt integer CHECK (workflow_run_attempt > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  terminal_reason text CHECK (terminal_reason ~ '^[a-z0-9_]{1,80}$'),
  artifact_references jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(artifact_references) = 'array'),
  UNIQUE (request_id, attempt_number),
  UNIQUE (id, request_id),
  UNIQUE (workflow_repository, workflow_run_id, workflow_run_attempt),
  CHECK ((workflow_repository IS NULL AND workflow_run_id IS NULL AND workflow_run_attempt IS NULL)
    OR (workflow_repository IS NOT NULL AND workflow_run_id IS NOT NULL AND workflow_run_attempt IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS launchloom_operations.stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES launchloom_operations.generation_attempts(id),
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 200),
  stage text NOT NULL CHECK (stage ~ '^[a-z0-9_]{1,80}$'),
  transition text NOT NULL CHECK (transition ~ '^[a-z0-9_]{1,80}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  detail_code text CHECK (detail_code ~ '^[a-z0-9_]{1,80}$'),
  provider text,
  model text,
  cost_kind text NOT NULL DEFAULT 'unreported' CHECK (cost_kind IN ('actual', 'estimated', 'unreported')),
  amount numeric(20, 8),
  currency text,
  UNIQUE (attempt_id, event_key),
  CONSTRAINT stage_events_cost_check CHECK (
    (cost_kind = 'unreported' AND amount IS NULL AND currency IS NULL)
    OR (cost_kind IN ('actual', 'estimated') AND amount IS NOT NULL AND amount >= 0
      AND amount <> 'NaN'::numeric AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$'))
);
CREATE TABLE IF NOT EXISTS launchloom_operations.dispatch_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES launchloom_operations.generation_attempts(id),
  request_id uuid NOT NULL,
  intake_id uuid NOT NULL,
  operation_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  -- IS TRUE rejects UNKNOWN as well as FALSE: CHECK alone accepts SQL NULL.
  -- Composite foreign keys bind these row IDs to the attempt's actual ancestry.
  CONSTRAINT dispatch_outbox_attempt_request_fkey FOREIGN KEY (attempt_id, request_id)
    REFERENCES launchloom_operations.generation_attempts(id, request_id),
  CONSTRAINT dispatch_outbox_request_intake_fkey FOREIGN KEY (request_id, intake_id)
    REFERENCES launchloom_operations.generation_requests(id, intake_id),
  CONSTRAINT dispatch_outbox_payload_check CHECK ((jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['schemaVersion', 'intakeId', 'requestId', 'attemptId', 'operationId']
    AND payload - ARRAY['schemaVersion', 'intakeId', 'requestId', 'attemptId', 'operationId'] = '{}'::jsonb
    AND jsonb_typeof(payload->'schemaVersion') = 'number'
    AND payload->'schemaVersion' = '1'::jsonb
    AND jsonb_typeof(payload->'intakeId') = 'string'
    AND jsonb_typeof(payload->'requestId') = 'string'
    AND jsonb_typeof(payload->'attemptId') = 'string'
    AND jsonb_typeof(payload->'operationId') = 'string'
    AND payload->>'operationId' = id::text
    AND payload->>'attemptId' = attempt_id::text
    AND payload->>'requestId' = request_id::text
    AND payload->>'intakeId' = intake_id::text) IS TRUE),
  state text NOT NULL DEFAULT 'blocked_unconfirmed' CHECK (state IN ('blocked_unconfirmed', 'pending', 'leased', 'dispatched', 'attention')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  fencing_version bigint NOT NULL DEFAULT 0 CHECK (fencing_version >= 0),
  last_error_code text CHECK (last_error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intakes_client_recency ON launchloom_operations.intakes(client_id, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS requests_intake_recency ON launchloom_operations.generation_requests(intake_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS attempts_state_recency ON launchloom_operations.generation_attempts(state, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS events_attempt_recency ON launchloom_operations.stage_events(attempt_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS outbox_eligible_recency ON launchloom_operations.dispatch_outbox(state, next_attempt_at, id);

CREATE OR REPLACE FUNCTION launchloom_operations.create_acceptance(
  p_invite text, p_submission text, p_fingerprint text, p_version integer,
  p_payload jsonb, p_consent jsonb, p_profile text
) RETURNS TABLE (intake_id uuid, request_id uuid, attempt_id uuid, operation_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE
  v_intake launchloom_operations.intakes%ROWTYPE;
  v_client uuid;
  v_request uuid;
  v_attempt uuid;
  v_operation uuid := gen_random_uuid();
BEGIN
  IF p_invite IS NULL OR length(p_invite) NOT BETWEEN 1 AND 200 OR p_invite <> btrim(p_invite)
    OR p_submission IS NULL OR length(p_submission) NOT BETWEEN 1 AND 200 OR p_submission <> btrim(p_submission)
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_version IS NULL OR p_version < 1
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR p_consent IS NULL OR jsonb_typeof(p_consent) <> 'object'
    OR NOT (p_consent @> '{"rightsConfirmed": true}'::jsonb)
    OR coalesce(jsonb_typeof(p_consent->'termsVersion'), '') <> 'string'
    OR coalesce(length(p_consent->>'termsVersion'), 0) NOT BETWEEN 1 AND 200
    OR p_profile IS NULL OR length(p_profile) NOT BETWEEN 1 AND 200 OR p_profile <> btrim(p_profile)
  THEN RAISE EXCEPTION 'invalid_acceptance'; END IF;

  -- Serialize even distinct submissions for this invite. Hash collisions only
  -- serialize unrelated intakes, never conflate identity. Fresh snapshots at
  -- READ COMMITTED see the winner; higher isolation may safely require retry.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_invite, 0));
  SELECT i.* INTO v_intake FROM launchloom_operations.intakes i WHERE i.invite_id = p_invite FOR UPDATE;
  IF FOUND THEN
    IF v_intake.submission_id <> p_submission OR v_intake.fingerprint <> p_fingerprint
      OR v_intake.payload_version <> p_version OR v_intake.payload <> p_payload OR v_intake.consent <> p_consent
      OR NOT EXISTS (SELECT 1 FROM launchloom_operations.generation_requests r WHERE r.intake_id = v_intake.id AND r.idempotency_key = 'initial' AND r.profile = p_profile)
    THEN RAISE EXCEPTION 'acceptance_conflict'; END IF;
    RETURN QUERY SELECT v_intake.id, r.id, a.id, o.id, false
      FROM launchloom_operations.generation_requests r
      JOIN launchloom_operations.generation_attempts a ON a.request_id = r.id AND a.attempt_number = 1
      JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
      WHERE r.intake_id = v_intake.id AND r.idempotency_key = 'initial';
    RETURN;
  END IF;
  INSERT INTO launchloom_operations.clients DEFAULT VALUES RETURNING id INTO v_client;
  INSERT INTO launchloom_operations.intakes(client_id, invite_id, submission_id, fingerprint, payload_version, payload, consent)
    VALUES (v_client, p_invite, p_submission, p_fingerprint, p_version, p_payload, p_consent) RETURNING * INTO v_intake;
  INSERT INTO launchloom_operations.generation_requests(intake_id, profile, idempotency_key)
    VALUES (v_intake.id, p_profile, 'initial') RETURNING id INTO v_request;
  INSERT INTO launchloom_operations.generation_attempts(request_id, attempt_number)
    VALUES (v_request, 1) RETURNING id INTO v_attempt;
  INSERT INTO launchloom_operations.dispatch_outbox(id, attempt_id, request_id, intake_id, operation_key, payload)
    VALUES (v_operation, v_attempt, v_request, v_intake.id, 'initial:' || v_attempt::text, jsonb_build_object(
      'schemaVersion', 1, 'intakeId', v_intake.id, 'requestId', v_request, 'attemptId', v_attempt, 'operationId', v_operation));
  RETURN QUERY SELECT v_intake.id, v_request, v_attempt, v_operation, true;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.confirm_acceptance(p_intake uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
BEGIN
  -- Invocation asserts prior durable DO confirmation; this function cannot
  -- itself prove an external DO action. Only the trusted handshake may call it.
  PERFORM 1 FROM launchloom_operations.intakes WHERE id = p_intake FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intake_not_found'; END IF;
  UPDATE launchloom_operations.intakes SET acceptance_state = 'confirmed', confirmed_at = coalesce(confirmed_at, now()) WHERE id = p_intake;
  UPDATE launchloom_operations.dispatch_outbox o SET state = 'pending'
    FROM launchloom_operations.generation_attempts a, launchloom_operations.generation_requests r
    WHERE o.attempt_id = a.id AND a.request_id = r.id AND r.intake_id = p_intake
      AND r.idempotency_key = 'initial' AND a.attempt_number = 1 AND o.state = 'blocked_unconfirmed';
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.get_intake(p_intake uuid)
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
  WHERE i.id = p_intake;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA launchloom_operations FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA launchloom_operations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA launchloom_operations FROM launchloom_operations_worker;
    GRANT USAGE ON SCHEMA launchloom_operations TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.create_acceptance(text, text, text, integer, jsonb, jsonb, text) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.confirm_acceptance(uuid) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_intake(uuid) TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
