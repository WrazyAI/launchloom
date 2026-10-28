-- Apply only to an explicitly approved target, as a trusted schema owner.
-- Read-only projections for the authenticated operations dashboard. These
-- functions cannot create, change, dispatch or resolve operational records.
BEGIN;

-- Global keyset pagination orders by this exact tuple. IF NOT EXISTS keeps the
-- migration safe when the owner re-applies the sequence.
CREATE INDEX IF NOT EXISTS attempts_created_recency ON launchloom_operations.generation_attempts(created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION launchloom_operations.operation_record(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT jsonb_build_object(
    'attemptId', a.id,
    'requestId', a.request_id,
    'intakeId', r.intake_id,
    'clientId', i.client_id,
    'operationId', o.id,
    'profile', r.profile,
    'attemptNumber', a.attempt_number,
    'status', CASE
      WHEN i.acceptance_state <> 'confirmed' THEN 'attention'
      WHEN a.state = 'succeeded' AND a.delivery_state = 'preview_ready' THEN 'preview_ready'
      WHEN a.state = 'succeeded' THEN 'attention'
      ELSE a.state END,
    'executionStatus', a.state,
    'dispatchState', CASE
      WHEN i.acceptance_state <> 'confirmed' THEN 'attention'
      WHEN o.state = 'attention' THEN 'attention'
      ELSE r.dispatch_state END,
    'deliveryStatus', a.delivery_state,
    'createdAt', a.created_at,
    'startedAt', a.started_at,
    'finishedAt', a.finished_at,
    'lastObservedAt', greatest(
      a.created_at,
      a.started_at,
      a.finished_at,
      a.reconciled_at,
      (SELECT max(e.recorded_at) FROM launchloom_operations.stage_events e WHERE e.attempt_id = a.id)
    ),
    'costKind', CASE
      WHEN EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
        WHERE e.attempt_id = a.id AND e.cost_kind = 'actual' AND e.amount IS NOT NULL) THEN 'actual'
      WHEN EXISTS (SELECT 1 FROM launchloom_operations.stage_events e
        WHERE e.attempt_id = a.id AND e.cost_kind = 'estimated' AND e.amount IS NOT NULL) THEN 'estimated'
      ELSE 'unreported' END,
    'telemetryIncomplete', (
      NOT EXISTS (SELECT 1 FROM launchloom_operations.stage_events e WHERE e.attempt_id = a.id)
      OR coalesce((
        SELECT sum(c.unreported) > 0 OR sum(c.incomplete) > 0 OR sum(c.unknown_coverage) > 0
        FROM launchloom_operations.attempt_cost_rollup(a.id) c
      ), true)
    ),
    'costs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'currency', c.currency,
        'actual', c.actual,
        'estimated', c.estimated,
        'unreportedCount', c.unreported,
        'incompleteCount', c.incomplete,
        'unknownCoverageCount', c.unknown_coverage
      ) ORDER BY c.currency NULLS FIRST)
      FROM launchloom_operations.attempt_cost_rollup(a.id) c
    ), '[]'::jsonb),
    'attentionReason', CASE
      WHEN i.acceptance_state <> 'confirmed' THEN 'acceptance_unconfirmed'
      WHEN a.state = 'attention' THEN coalesce(a.terminal_reason, 'operator_attention')
      WHEN a.state = 'succeeded' AND a.delivery_state <> 'preview_ready' THEN 'missing_handoff'
      WHEN o.state = 'attention' THEN coalesce(o.last_error_code, 'dispatch_attention')
      WHEN o.retry_count >= 3 THEN 'repeated_dispatch_failure'
      WHEN a.state = 'waiting_to_start' AND a.created_at < now() - interval '10 minutes' THEN 'aging_outbox'
      ELSE NULL END,
    'recoveryReason', CASE
      WHEN i.acceptance_state <> 'confirmed' THEN 'acceptance_unconfirmed'
      WHEN a.state = 'attention' THEN coalesce(a.terminal_reason, 'operator_attention')
      WHEN a.state = 'succeeded' AND a.delivery_state <> 'preview_ready' THEN 'missing_handoff'
      WHEN o.state = 'attention' THEN coalesce(o.last_error_code, 'dispatch_attention')
      WHEN o.retry_count >= 3 THEN 'repeated_dispatch_failure'
      WHEN a.state = 'waiting_to_start' AND a.created_at < now() - interval '10 minutes' THEN 'aging_outbox'
      ELSE NULL END,
    'operatorAction', (
      SELECT jsonb_build_object(
        'actorId', x.actor_id,
        'recordedAt', x.recorded_at,
        'decision', x.decision,
        'evidenceRef', x.evidence_ref
      )
      FROM launchloom_operations.operator_resolutions x
      WHERE x.attempt_id = a.id
      ORDER BY x.recorded_at DESC, x.id DESC
      LIMIT 1
    )
  )
  FROM launchloom_operations.generation_attempts a
  JOIN launchloom_operations.generation_requests r ON r.id = a.request_id
  JOIN launchloom_operations.intakes i ON i.id = r.intake_id
  JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  WHERE a.id = p_id;
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.list_operations(
  p_limit integer, p_before_created timestamptz, p_before_id uuid
)
RETURNS TABLE(record jsonb) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  WITH eligible AS (
    SELECT a.id, a.created_at
    FROM launchloom_operations.generation_attempts a
    JOIN launchloom_operations.generation_requests r ON r.id = a.request_id
    JOIN launchloom_operations.intakes i ON i.id = r.intake_id
    JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  ), filtered AS (
    SELECT id, created_at FROM eligible
    WHERE p_before_created IS NULL
      OR (created_at, id) < (p_before_created, p_before_id)
  ), page AS (
    SELECT id, created_at FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit + 1
  ), visible AS (
    SELECT id, created_at FROM page
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(item.record ORDER BY item.created_at DESC, item.id DESC)
      FROM (
        SELECT launchloom_operations.operation_record(visible.id) AS record,
          visible.created_at, visible.id
        FROM visible
      ) item
      WHERE item.record IS NOT NULL
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM eligible),
    'hasMore', (SELECT count(*) FROM page) > p_limit
  );
$$;

CREATE OR REPLACE FUNCTION launchloom_operations.get_operation(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp AS $$
  SELECT launchloom_operations.operation_record(a.id) || jsonb_build_object(
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'eventId', e.id,
        'eventKey', e.event_key,
        'stage', e.stage,
        'transition', e.transition,
        'occurredAt', e.occurred_at,
        'recordedAt', e.recorded_at,
        'detailCode', e.detail_code,
        'provider', e.provider,
        'model', e.model,
        'costKind', e.cost_kind,
        'amount', e.amount::text,
        'currency', e.currency,
        'buildSha', e.build_sha
      ) ORDER BY e.recorded_at DESC, e.id DESC)
      FROM (
        SELECT * FROM launchloom_operations.stage_events
        WHERE attempt_id = a.id
        ORDER BY recorded_at DESC, id DESC
        LIMIT 100
      ) e
    ), '[]'::jsonb),
    'eventCount', (SELECT count(*) FROM launchloom_operations.stage_events WHERE attempt_id = a.id),
    'workflow', jsonb_build_object(
      'repository', a.workflow_repository,
      'runId', a.workflow_run_id,
      'runAttempt', a.workflow_run_attempt
    ),
    'outbox', jsonb_build_object(
      'state', o.state,
      'retryCount', o.retry_count,
      'nextAttemptAt', o.next_attempt_at,
      'lastErrorCode', o.last_error_code
    )
  )
  FROM launchloom_operations.generation_attempts a
  JOIN launchloom_operations.dispatch_outbox o ON o.attempt_id = a.id
  WHERE a.id = p_id;
$$;

-- Trusted Worker service functions only. No table privileges, public execution,
-- browser database credentials or membership-role inheritance are introduced.
REVOKE ALL ON FUNCTION launchloom_operations.operation_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.list_operations(integer,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.get_operation(uuid) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    GRANT EXECUTE ON FUNCTION launchloom_operations.operation_record(uuid) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.list_operations(integer,timestamptz,uuid) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.get_operation(uuid) TO launchloom_operations_worker;
  END IF;
END $$;

COMMIT;
