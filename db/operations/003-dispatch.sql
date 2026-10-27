-- Isolated/staging migration only until separately authorized for production.
-- Service functions do not authenticate GitHub. The Task 4 adapter MUST verify
-- repository/workflow/ref/audience/expiry and the operation's configured target.
BEGIN;

-- Durable proof that this operation had at least one ambiguous send (a lost
-- response or a crashed sender lease). Only such a pending replay may be
-- claimed; a plain 429 retry is proven non-acceptance and cannot elect a run.
ALTER TABLE launchloom_operations.dispatch_outbox
  ADD COLUMN IF NOT EXISTS uncertain_replay boolean NOT NULL DEFAULT false;

-- Provenance is captured before the first network send and is never upgraded.
-- NULL means no send has ever been leased. A historical unverified send must
-- never become eligible for automatic uncertain replay after a flag toggle.
ALTER TABLE launchloom_operations.dispatch_outbox
  ADD COLUMN IF NOT EXISTS gate_provenance text
    CHECK (gate_provenance IS NULL OR gate_provenance IN ('verified-v1', 'unverified'));

-- 003 is still unmerged. Remove the earlier one-argument and four-argument
-- forms so re-applying it cannot leave an ambiguous overload that silently
-- skips the verified-gate decision.
DROP FUNCTION IF EXISTS launchloom_operations.lease_dispatch(timestamptz);
DROP FUNCTION IF EXISTS launchloom_operations.record_dispatch_result(uuid, bigint, text, timestamptz);

CREATE OR REPLACE FUNCTION launchloom_operations.lease_dispatch(
  p_now timestamptz, p_uncertain_retry boolean DEFAULT false
)
RETURNS TABLE (operation_id uuid, fence bigint, payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE v launchloom_operations.dispatch_outbox%ROWTYPE;
BEGIN
  IF p_now IS NULL OR NOT isfinite(p_now) OR p_uncertain_retry IS NULL
    THEN RAISE EXCEPTION 'invalid_dispatch'; END IF;
  -- An unowned waiting attempt that already carries effect evidence must never
  -- be leased. Lock the outbox and attempt rows together so a concurrent stage
  -- write cannot slip between the check and the send. Surface it as attention.
  FOR v IN SELECT o.* FROM launchloom_operations.dispatch_outbox o
    JOIN launchloom_operations.generation_attempts a ON a.id = o.attempt_id
    WHERE o.state IN ('blocked_unconfirmed', 'pending', 'leased')
      AND a.state = 'waiting_to_start' AND a.workflow_run_id IS NULL
      AND (a.started_at IS NOT NULL OR a.finished_at IS NOT NULL
        OR a.terminal_reason IS NOT NULL
        OR a.artifact_references <> '[]'::jsonb
        OR EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
          WHERE e.attempt_id = a.id))
    ORDER BY o.next_attempt_at, o.id LIMIT 50
    FOR UPDATE OF o, a SKIP LOCKED
  LOOP
    UPDATE launchloom_operations.dispatch_outbox SET state = 'attention',
      lease_until = NULL, fencing_version = fencing_version + 1,
      last_error_code = 'prior_effects_unexplained' WHERE id = v.id;
    UPDATE launchloom_operations.generation_requests SET dispatch_state = 'attention'
      WHERE id = v.request_id;
    UPDATE launchloom_operations.generation_attempts SET state = 'attention',
      terminal_reason = coalesce(terminal_reason, 'unexplained_prior_effects')
      WHERE id = v.attempt_id AND state = 'waiting_to_start';
  END LOOP;

  -- Expiry is NOT evidence that GitHub rejected a dispatch. A crashed sender
  -- may already have started a run. Under the verified claim gate the entry is
  -- fenced and re-queued after bounded backoff; otherwise it stays attention.
  -- The persisted first-send provenance, not the current flag, decides whether
  -- an unverified historical send may ever be auto-replayed.
  FOR v IN SELECT o.* FROM launchloom_operations.dispatch_outbox o
    JOIN launchloom_operations.generation_attempts a ON a.id = o.attempt_id
    WHERE (o.state = 'leased' AND o.lease_until <= p_now)
       OR (o.state = 'dispatched' AND o.next_attempt_at <= p_now
         AND a.workflow_run_id IS NULL)
    ORDER BY o.next_attempt_at, o.id LIMIT 50
    FOR UPDATE OF o, a SKIP LOCKED
  LOOP
    IF EXISTS (SELECT 1 FROM launchloom_operations.generation_attempts a
      WHERE a.id = v.attempt_id AND a.state = 'waiting_to_start'
        AND (a.started_at IS NOT NULL OR a.finished_at IS NOT NULL
          OR a.terminal_reason IS NOT NULL
          OR a.artifact_references <> '[]'::jsonb
          OR EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
            WHERE e.attempt_id = a.id)))
    THEN
      UPDATE launchloom_operations.dispatch_outbox SET state = 'attention',
        lease_until = NULL, fencing_version = fencing_version + 1,
        last_error_code = 'prior_effects_unexplained' WHERE id = v.id;
      UPDATE launchloom_operations.generation_requests SET dispatch_state = 'attention'
        WHERE id = v.request_id;
      UPDATE launchloom_operations.generation_attempts SET state = 'attention',
        terminal_reason = coalesce(terminal_reason, 'unexplained_prior_effects')
        WHERE id = v.attempt_id AND state = 'waiting_to_start';
    ELSIF v.state = 'leased' AND p_uncertain_retry
      AND v.gate_provenance = 'verified-v1' AND v.retry_count + 1 < 8 THEN
      UPDATE launchloom_operations.dispatch_outbox SET state = 'pending',
        lease_until = NULL, fencing_version = fencing_version + 1,
        retry_count = retry_count + 1, uncertain_replay = true,
        last_error_code = 'dispatch_lease_expired',
        next_attempt_at = p_now + make_interval(secs =>
          least(3600, 60 * power(2, v.retry_count)::integer)) WHERE id = v.id;
      UPDATE launchloom_operations.generation_requests SET dispatch_state = 'waiting_to_start'
        WHERE id = v.request_id;
    ELSE
      UPDATE launchloom_operations.dispatch_outbox SET state = 'attention', lease_until = NULL,
        fencing_version = fencing_version + 1,
        last_error_code = CASE WHEN v.state = 'leased' THEN 'dispatch_lease_expired' ELSE 'run_claim_missing' END
        WHERE id = v.id;
      UPDATE launchloom_operations.generation_requests SET dispatch_state = 'attention'
        WHERE id = v.request_id;
    END IF;
  END LOOP;

  SELECT o.* INTO v FROM launchloom_operations.dispatch_outbox o
    JOIN launchloom_operations.intakes i ON i.id = o.intake_id
    JOIN launchloom_operations.generation_requests r ON r.id = o.request_id
    JOIN launchloom_operations.generation_attempts a ON a.id = o.attempt_id
    WHERE o.state = 'pending' AND o.next_attempt_at <= p_now AND o.retry_count < 8
      AND i.acceptance_state = 'confirmed' AND r.dispatch_state = 'waiting_to_start'
      AND a.state = 'waiting_to_start' AND a.workflow_run_id IS NULL
      AND a.started_at IS NULL AND a.finished_at IS NULL
      AND a.terminal_reason IS NULL AND a.artifact_references = '[]'::jsonb
      AND NOT EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
        WHERE e.attempt_id = a.id)
    ORDER BY o.next_attempt_at, o.id LIMIT 1
    FOR UPDATE OF o, a SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE launchloom_operations.dispatch_outbox SET state = 'leased',
    lease_until = p_now + interval '2 minutes', fencing_version = fencing_version + 1,
    gate_provenance = coalesce(gate_provenance,
      CASE WHEN p_uncertain_retry AND v.retry_count = 0
        AND NOT v.uncertain_replay THEN 'verified-v1' ELSE 'unverified' END)
    WHERE id = v.id RETURNING * INTO v;
  RETURN QUERY SELECT v.id, v.fencing_version, v.payload;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.record_dispatch_result(
  p_operation uuid, p_fence bigint, p_outcome text, p_now timestamptz,
  p_uncertain_retry boolean DEFAULT false, p_retry_after integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE v launchloom_operations.dispatch_outbox%ROWTYPE; v_state text; v_error text;
BEGIN
  IF p_fence IS NULL OR p_fence < 1 OR p_outcome IS NULL
    OR p_outcome NOT IN ('accepted', 'retryable', 'unknown', 'rejected')
    OR p_now IS NULL OR NOT isfinite(p_now) OR p_uncertain_retry IS NULL
    OR (p_retry_after IS NOT NULL AND (p_retry_after < 1 OR p_retry_after > 3600))
    THEN RAISE EXCEPTION 'invalid_dispatch'; END IF;
  SELECT o.* INTO v FROM launchloom_operations.dispatch_outbox o WHERE o.id = p_operation FOR UPDATE;
  -- A run may claim before the HTTP response is observed. Its election fences
  -- this sender too; no transport result may regress an already running owner.
  IF NOT FOUND OR v.state <> 'leased' OR v.fencing_version <> p_fence
    OR v.lease_until <= p_now THEN RETURN; END IF;
  v_state := CASE
    WHEN p_outcome = 'accepted' THEN 'dispatched'
    WHEN p_outcome = 'unknown' AND p_uncertain_retry
      AND v.gate_provenance = 'verified-v1' AND v.retry_count + 1 < 8 THEN 'pending'
    WHEN p_outcome = 'retryable' AND v.retry_count + 1 < 8 THEN 'pending'
    ELSE 'attention' END;
  v_error := CASE WHEN p_outcome = 'unknown' THEN 'dispatch_unknown'
    WHEN p_outcome = 'rejected' THEN 'dispatch_rejected'
    WHEN p_outcome = 'retryable' AND v_state = 'attention' THEN 'dispatch_retries_exhausted'
    WHEN p_outcome = 'retryable' THEN 'github_rate_limited' ELSE NULL END;
  UPDATE launchloom_operations.dispatch_outbox SET state = v_state,
    retry_count = retry_count + 1, lease_until = NULL, last_error_code = v_error,
    uncertain_replay = uncertain_replay OR (p_outcome = 'unknown'
      AND p_uncertain_retry AND v.gate_provenance = 'verified-v1'),
    next_attempt_at = p_now + CASE WHEN v_state = 'pending'
      THEN make_interval(secs => least(3600, greatest(
        least(3600, 60 * power(2, v.retry_count)::integer),
        coalesce(p_retry_after, 0))))
      ELSE interval '10 minutes' END
    WHERE id = v.id;
  UPDATE launchloom_operations.generation_requests SET dispatch_state =
    CASE WHEN v_state = 'pending' THEN 'waiting_to_start'
      WHEN v_state = 'dispatched' THEN 'dispatched' ELSE 'attention' END
    WHERE id = v.request_id;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.claim_run(
  p_operation uuid, p_repository text, p_run text, p_attempt integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE v launchloom_operations.dispatch_outbox%ROWTYPE;
  a launchloom_operations.generation_attempts%ROWTYPE;
BEGIN
  IF p_repository IS NULL OR p_repository !~ '^[1-9][0-9]{0,19}$'
    OR p_run IS NULL OR p_run !~ '^[1-9][0-9]{0,19}$'
    OR p_attempt IS NULL OR p_attempt < 1 THEN RAISE EXCEPTION 'invalid_dispatch'; END IF;
  SELECT o.* INTO v FROM launchloom_operations.dispatch_outbox o
    JOIN launchloom_operations.intakes i ON i.id = o.intake_id
    WHERE o.id = p_operation AND i.acceptance_state = 'confirmed' FOR UPDATE OF o;
  IF NOT FOUND THEN RETURN 'attention'; END IF;
  SELECT ga.* INTO a FROM launchloom_operations.generation_attempts ga WHERE ga.id = v.attempt_id FOR UPDATE;
  -- Never infer that an old owner's side effects are absent. Same-run retries
  -- also stop: a lost claim response requires reconciliation, not re-execution.
  IF a.state = 'attention' THEN RETURN 'attention'; END IF;
  IF a.workflow_run_id IS NOT NULL THEN RETURN 'duplicate'; END IF;
  IF a.started_at IS NOT NULL OR a.finished_at IS NOT NULL
    OR a.terminal_reason IS NOT NULL OR a.artifact_references <> '[]'::jsonb
    OR EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
      WHERE e.attempt_id = a.id)
  THEN
    UPDATE launchloom_operations.dispatch_outbox SET state = 'attention',
      lease_until = NULL, fencing_version = fencing_version + 1,
      last_error_code = 'prior_effects_unexplained' WHERE id = v.id;
    UPDATE launchloom_operations.generation_requests SET dispatch_state = 'attention'
      WHERE id = v.request_id;
    UPDATE launchloom_operations.generation_attempts SET state = 'attention',
      terminal_reason = coalesce(terminal_reason, 'unexplained_prior_effects')
      WHERE id = a.id AND state = 'waiting_to_start';
    RETURN 'attention';
  END IF;
  -- A gated uncertain replay may be `pending` or already terminal-attention
  -- while a real run from the earlier accept arrives. Prior verified uncertain
  -- evidence survives later 429/rejection status, so that run remains the
  -- rightful first owner. A plain 429 retry is proven non-acceptance and has no
  -- uncertain evidence, so it is NOT claimable. The row lock and unique run
  -- identity keep this a single winner; once claimed, the attempt is running and
  -- cannot be leased again.
  IF a.state <> 'waiting_to_start' OR (
    v.state NOT IN ('leased', 'dispatched')
    AND NOT (v.state IN ('pending', 'attention') AND v.uncertain_replay)
    AND NOT (v.state = 'attention' AND v.last_error_code IN (
      'dispatch_unknown', 'dispatch_lease_expired', 'run_claim_missing')))
    THEN RETURN 'attention'; END IF;
  UPDATE launchloom_operations.generation_attempts SET workflow_repository = p_repository,
    workflow_run_id = p_run, workflow_run_attempt = p_attempt,
    state = 'running', started_at = clock_timestamp() WHERE id = a.id;
  UPDATE launchloom_operations.dispatch_outbox SET state = 'dispatched', lease_until = NULL,
    fencing_version = fencing_version + 1, last_error_code = NULL WHERE id = v.id;
  UPDATE launchloom_operations.generation_requests SET dispatch_state = 'dispatched' WHERE id = v.request_id;
  RETURN 'claimed';
EXCEPTION WHEN unique_violation THEN
  -- The same trusted run identity cannot own a different operation. The
  -- subtransaction rolls back ALL writes above; no partial election survives.
  RETURN 'attention';
END;
$$;

REVOKE ALL ON FUNCTION launchloom_operations.lease_dispatch(timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.record_dispatch_result(uuid, bigint, text, timestamptz, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.claim_run(uuid, text, text, integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.lease_dispatch(timestamptz, boolean) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.record_dispatch_result(uuid, bigint, text, timestamptz, boolean, integer) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.claim_run(uuid, text, text, integer) TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
