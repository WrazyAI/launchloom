-- Acceptance recovery lookup. Apply only to an explicitly approved target as a
-- trusted schema owner. This is a service-only read function, not a public API.
BEGIN;

CREATE OR REPLACE FUNCTION launchloom_operations.get_acceptance_by_binding(
  p_invite text, p_submission text
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
  WHERE i.invite_id = p_invite AND i.submission_id = p_submission
    AND p_invite IS NOT NULL AND length(p_invite) BETWEEN 1 AND 200
    AND p_submission IS NOT NULL AND length(p_submission) BETWEEN 1 AND 200;
$$;

REVOKE ALL ON FUNCTION launchloom_operations.get_acceptance_by_binding(text, text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_acceptance_by_binding(text, text) TO launchloom_operations_worker;
  END IF;
END $$;
COMMIT;
