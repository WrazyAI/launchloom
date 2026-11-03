-- Generation activity trace: private, append-only diagnostic evidence.
--
-- This is deliberately separate from stage_events and never participates in
-- lifecycle, delivery or cost authority. Apply only as a trusted schema owner
-- against an explicitly approved target. No role/login provisioning happens
-- here; the existing isolated launchloom_operations_worker role receives only
-- the two functions below when it exists.
BEGIN;
CREATE TABLE IF NOT EXISTS launchloom_operations.activity_partitions (
  namespace text NOT NULL CHECK (namespace IN ('legacy', 'operations')),
  attempt_id text NOT NULL CHECK (length(attempt_id) BETWEEN 1 AND 200),
  repository_id text NOT NULL CHECK (repository_id ~ '^[1-9][0-9]{0,19}$'),
  run_id text NOT NULL CHECK (run_id ~ '^[1-9][0-9]{0,19}$'),
  run_attempt integer NOT NULL CHECK (run_attempt > 0),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  byte_count integer NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
  verbose_cutoff boolean NOT NULL DEFAULT false,
  suppressed_count integer NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  producer_finished boolean NOT NULL DEFAULT false,
  recording text NOT NULL DEFAULT 'recording'
    CHECK (recording IN ('recording', 'complete', 'incomplete')),
  last_heartbeat_at timestamptz,
  first_event_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, attempt_id),
  CHECK (namespace <> 'operations'
    OR attempt_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

CREATE TABLE IF NOT EXISTS launchloom_operations.activity_events (
  namespace text NOT NULL,
  attempt_id text NOT NULL,
  cursor integer NOT NULL CHECK (cursor > 0),
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{1,40}$'),
  stage text NOT NULL CHECK (stage ~ '^[a-z0-9_]{1,80}$'),
  producer_id uuid NOT NULL,
  producer_sequence integer NOT NULL CHECK (producer_sequence > 0),
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  emitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 16384),
  PRIMARY KEY (namespace, attempt_id, cursor),
  UNIQUE (namespace, attempt_id, event_id),
  CONSTRAINT activity_events_partition_fkey
    FOREIGN KEY (namespace, attempt_id)
    REFERENCES launchloom_operations.activity_partitions(namespace, attempt_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS activity_events_recency
  ON launchloom_operations.activity_events(namespace, attempt_id, cursor DESC);
CREATE INDEX IF NOT EXISTS activity_partitions_expiry
  ON launchloom_operations.activity_partitions(expires_at);

CREATE TABLE IF NOT EXISTS launchloom_operations.activity_coverage (
  namespace text NOT NULL,
  attempt_id text NOT NULL,
  boundary text NOT NULL CHECK (boundary ~ '^[a-z0-9_.:-]{1,120}$'),
  status text NOT NULL CHECK (status IN ('instrumented', 'not_applicable', 'unsupported', 'limited')),
  detail text CHECK (detail IS NULL OR length(detail) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, attempt_id, boundary),
  CONSTRAINT activity_coverage_partition_fkey
    FOREIGN KEY (namespace, attempt_id)
    REFERENCES launchloom_operations.activity_partitions(namespace, attempt_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS launchloom_operations.activity_usage (
  namespace text NOT NULL,
  attempt_id text NOT NULL,
  call_id uuid NOT NULL,
  input_tokens bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cached_input_tokens bigint CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  cache_write_tokens bigint CHECK (cache_write_tokens IS NULL OR cache_write_tokens >= 0),
  reasoning_tokens bigint CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),
  cost_usd numeric(20, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  cost_kind text NOT NULL CHECK (cost_kind IN ('actual', 'estimated', 'unreported')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, attempt_id, call_id),
  CONSTRAINT activity_usage_partition_fkey
    FOREIGN KEY (namespace, attempt_id)
    REFERENCES launchloom_operations.activity_partitions(namespace, attempt_id)
    ON DELETE CASCADE,
  CONSTRAINT activity_usage_cost_check CHECK (
    (cost_kind = 'unreported' AND cost_usd IS NULL)
    OR (cost_kind IN ('actual', 'estimated') AND cost_usd IS NOT NULL)
  )
);

-- Content-free tombstone: distinguishes "expired" from "never recorded" after
-- the retained diagnostic content is actually deleted.
CREATE TABLE IF NOT EXISTS launchloom_operations.activity_expired (
  namespace text NOT NULL,
  attempt_id text NOT NULL,
  expired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, attempt_id)
);

REVOKE ALL ON launchloom_operations.activity_partitions FROM PUBLIC;
REVOKE ALL ON launchloom_operations.activity_events FROM PUBLIC;
REVOKE ALL ON launchloom_operations.activity_coverage FROM PUBLIC;
REVOKE ALL ON launchloom_operations.activity_usage FROM PUBLIC;
REVOKE ALL ON launchloom_operations.activity_expired FROM PUBLIC;

CREATE OR REPLACE FUNCTION launchloom_operations.append_activity_events(
  p_namespace text,
  p_attempt text,
  p_repository_id text,
  p_run_id text,
  p_run_attempt integer,
  p_events jsonb
) RETURNS TABLE (accepted integer, last_cursor integer, suppressed boolean, expired boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE
  v_partition launchloom_operations.activity_partitions%ROWTYPE;
  v_event jsonb;
  v_kind text;
  v_event_id uuid;
  v_sequence integer;
  v_cursor integer;
  v_bytes integer;
  v_count integer := 0;
  v_suppressed boolean := false;
  v_control boolean;
  v_total integer;
  v_recording text;
BEGIN
  IF p_namespace IS NULL OR p_namespace NOT IN ('legacy', 'operations')
    OR p_attempt IS NULL OR length(p_attempt) NOT BETWEEN 1 AND 200
    OR p_repository_id IS NULL OR p_repository_id !~ '^[1-9][0-9]{0,19}$'
    OR p_run_id IS NULL OR p_run_id !~ '^[1-9][0-9]{0,19}$'
    OR p_run_attempt IS NULL OR p_run_attempt < 1
    OR p_events IS NULL OR jsonb_typeof(p_events) <> 'array'
  THEN RAISE EXCEPTION 'activity_invalid'; END IF;

  v_total := jsonb_array_length(p_events);
  IF v_total < 1 OR v_total > 100 THEN RAISE EXCEPTION 'activity_invalid'; END IF;

  SELECT * INTO v_partition
    FROM launchloom_operations.activity_partitions
   WHERE namespace = p_namespace AND attempt_id = p_attempt
   FOR UPDATE;

  IF NOT FOUND THEN
    -- A concurrent first append can win the insert after both transactions
    -- observed no row. ON CONFLICT plus a blocking re-select makes creation
    -- idempotent without ever adopting the winner's ownership unverified.
    IF p_namespace = 'operations' THEN
      IF p_attempt !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN RAISE EXCEPTION 'activity_invalid'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM launchloom_operations.generation_attempts
         WHERE id = p_attempt::uuid
           AND workflow_repository = 'WrazyAI/launchloom'
           AND workflow_run_id = p_run_id
           AND workflow_run_attempt = p_run_attempt
      ) THEN RAISE EXCEPTION 'activity_not_owned'; END IF;
    END IF;
    INSERT INTO launchloom_operations.activity_partitions(
      namespace, attempt_id, repository_id, run_id, run_attempt, expires_at
    ) VALUES (
      p_namespace, p_attempt, p_repository_id, p_run_id, p_run_attempt,
      now() + interval '30 days'
    )
    ON CONFLICT (namespace, attempt_id) DO NOTHING;
    SELECT * INTO v_partition
      FROM launchloom_operations.activity_partitions
     WHERE namespace = p_namespace AND attempt_id = p_attempt
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'activity_invalid'; END IF;
  END IF;

  IF v_partition.repository_id <> p_repository_id
    OR v_partition.run_id <> p_run_id
    OR v_partition.run_attempt <> p_run_attempt
  THEN RAISE EXCEPTION 'activity_not_owned'; END IF;
  IF v_partition.expires_at <= now() THEN
    RETURN QUERY SELECT 0, v_partition.sequence, false, true;
    RETURN;
  END IF;

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_event_id := (v_event->>'eventId')::uuid;
    v_kind := v_event->>'kind';
    v_sequence := (v_event->>'sequence')::integer;
    v_bytes := length(v_event::text);
    IF v_kind IS NULL OR v_sequence IS NULL OR v_sequence < 1
      OR v_bytes < 1 OR v_bytes > 16384
    THEN RAISE EXCEPTION 'activity_invalid'; END IF;
    IF (v_event->'context'->>'namespace') IS DISTINCT FROM p_namespace
      OR (v_event->'context'->>'attemptId') IS DISTINCT FROM p_attempt
      OR (v_event->'context'->>'producerId') IS NULL
      OR (v_event->'context'->>'stage') IS NULL
      OR (v_event->'context'->>'actor') IS NULL
      OR jsonb_typeof(v_event->'payload') IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'activity_invalid'; END IF;

    -- Reserve control capacity so terminal evidence survives a pathological
    -- verbose stream. After the hard ceiling only control events are accepted.
    IF v_partition.event_count >= 10000
      OR v_partition.byte_count >= 10485760
    THEN
      v_suppressed := true;
      CONTINUE;
    END IF;
    v_control := v_kind IN (
      'coverage', 'heartbeat', 'producer_finished', 'error',
      'task_finished', 'model_finished'
    );
    IF NOT v_control AND (
      v_partition.verbose_cutoff
      OR v_partition.event_count >= 10000 - 32
      OR v_partition.byte_count >= 10485760 - 524288
    ) THEN
      v_partition.verbose_cutoff := true;
      v_suppressed := true;
      CONTINUE;
    END IF;

    v_cursor := v_partition.sequence + 1;
    INSERT INTO launchloom_operations.activity_events(
      namespace, attempt_id, cursor, event_id, kind, stage, producer_id,
      producer_sequence, context, emitted_at, payload, byte_size
    ) VALUES (
      p_namespace, p_attempt, v_cursor, v_event_id, v_kind,
      v_event->'context'->>'stage',
      (v_event->'context'->>'producerId')::uuid,
      v_sequence,
      v_event->'context',
      coalesce((v_event->>'emittedAt')::timestamptz, now()),
      v_event->'payload',
      v_bytes
    )
    ON CONFLICT (namespace, attempt_id, event_id) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
      v_partition.sequence := v_cursor;
      v_partition.event_count := v_partition.event_count + 1;
      v_partition.byte_count := v_partition.byte_count + v_bytes;

      IF v_kind = 'heartbeat' THEN
        v_partition.last_heartbeat_at := now();
      ELSIF v_kind = 'coverage' THEN
        INSERT INTO launchloom_operations.activity_coverage(
          namespace, attempt_id, boundary, status, detail
        ) VALUES (
          p_namespace, p_attempt, v_event->'payload'->>'boundary',
          v_event->'payload'->>'status',
          left(v_event->'payload'->'detail'->>'text', 1000)
        )
        ON CONFLICT (namespace, attempt_id, boundary) DO UPDATE
          SET status = EXCLUDED.status,
              detail = EXCLUDED.detail,
              updated_at = now();
      ELSIF v_kind = 'usage' THEN
        INSERT INTO launchloom_operations.activity_usage(
          namespace, attempt_id, call_id, input_tokens, output_tokens,
          cached_input_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, cost_kind
        ) VALUES (
          p_namespace, p_attempt, (v_event->'payload'->>'callId')::uuid,
          (v_event->'payload'->'usage'->>'inputTokens')::bigint,
          (v_event->'payload'->'usage'->>'outputTokens')::bigint,
          (v_event->'payload'->'usage'->>'cachedInputTokens')::bigint,
          (v_event->'payload'->'usage'->>'cacheWriteTokens')::bigint,
          (v_event->'payload'->'usage'->>'reasoningTokens')::bigint,
          (v_event->'payload'->'usage'->>'costUsd')::numeric,
          v_event->'payload'->'usage'->>'costKind'
        )
        ON CONFLICT (namespace, attempt_id, call_id) DO NOTHING;
      ELSIF v_kind = 'producer_finished' THEN
        v_partition.producer_finished := true;
        v_recording := CASE
          WHEN v_event->'payload'->>'status' = 'complete' THEN 'complete'
          ELSE 'incomplete'
        END;
        v_partition.recording := v_recording;
      END IF;
    ELSE
      -- A repeated event ID with identical evidence is an idempotent delivery
      -- replay. Reusing the ID for different evidence is rejected, not merged.
      IF NOT EXISTS (
        SELECT 1 FROM launchloom_operations.activity_events
         WHERE namespace = p_namespace
           AND attempt_id = p_attempt
           AND event_id = v_event_id
           AND kind = v_kind
           AND payload = v_event->'payload'
      ) THEN RAISE EXCEPTION 'activity_conflict'; END IF;
    END IF;
  END LOOP;

  IF v_suppressed THEN
    v_partition.suppressed_count := v_partition.suppressed_count + 1;
    INSERT INTO launchloom_operations.activity_coverage(
      namespace, attempt_id, boundary, status, detail
    ) VALUES (
      p_namespace, p_attempt, 'trace.capacity', 'limited',
      'Detailed content stopped at the retained activity limit.'
    )
    ON CONFLICT (namespace, attempt_id, boundary) DO UPDATE
      SET status = 'limited', updated_at = now();
  END IF;

  UPDATE launchloom_operations.activity_partitions
     SET sequence = v_partition.sequence,
         event_count = v_partition.event_count,
         byte_count = v_partition.byte_count,
         verbose_cutoff = v_partition.verbose_cutoff,
         suppressed_count = v_partition.suppressed_count,
         producer_finished = v_partition.producer_finished,
         recording = v_partition.recording,
         last_heartbeat_at = v_partition.last_heartbeat_at,
         updated_at = now()
   WHERE namespace = p_namespace AND attempt_id = p_attempt;

  RETURN QUERY SELECT v_count, v_partition.sequence, v_suppressed, false;
END;
$$;

-- Delete only expired diagnostic content, leaving lifecycle and cost evidence
-- untouched. A content-free tombstone preserves the difference between an
-- expired trace and a run that never recorded one.
CREATE OR REPLACE FUNCTION launchloom_operations.prune_activity(p_limit integer)
RETURNS TABLE (deleted integer, remaining boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500
  THEN RAISE EXCEPTION 'activity_invalid'; END IF;

  WITH expired AS (
    SELECT namespace, attempt_id
      FROM launchloom_operations.activity_partitions
     WHERE expires_at <= now()
     ORDER BY expires_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM launchloom_operations.activity_partitions p
     USING expired e
     WHERE p.namespace = e.namespace AND p.attempt_id = e.attempt_id
     RETURNING p.namespace, p.attempt_id
  ), tombstoned AS (
    INSERT INTO launchloom_operations.activity_expired(namespace, attempt_id, expired_at)
    SELECT namespace, attempt_id, now() FROM removed
    ON CONFLICT (namespace, attempt_id) DO UPDATE SET expired_at = EXCLUDED.expired_at
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted FROM removed;

  RETURN QUERY SELECT
    v_deleted,
    EXISTS (SELECT 1 FROM launchloom_operations.activity_partitions WHERE expires_at <= now());
END;
$$;

REVOKE ALL ON FUNCTION launchloom_operations.append_activity_events(text, text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_operations.prune_activity(integer) FROM PUBLIC;

-- Read one bounded page plus rollups through the service boundary. Tables stay
-- unreadable to the worker role, exactly like the existing dashboard function.
CREATE OR REPLACE FUNCTION launchloom_operations.read_activity(
  p_namespace text,
  p_attempt text,
  p_after integer,
  p_before integer,
  p_limit integer
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, launchloom_operations, pg_temp
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_namespace IS NULL OR p_namespace NOT IN ('legacy', 'operations')
    OR p_attempt IS NULL OR length(p_attempt) NOT BETWEEN 1 AND 200
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR (p_after IS NOT NULL AND p_after < 1)
    OR (p_before IS NOT NULL AND p_before < 1)
    OR (p_after IS NOT NULL AND p_before IS NOT NULL)
  THEN RAISE EXCEPTION 'activity_invalid'; END IF;

  SELECT json_build_object(
    'partition', (
      select row_to_json(p) from (
        select recording, event_count, byte_count,
               (extract(epoch from last_heartbeat_at) * 1000)::double precision as last_heartbeat_ms,
               (extract(epoch from expires_at) * 1000)::double precision as expires_ms
          from launchloom_operations.activity_partitions
         where namespace = p_namespace and attempt_id = p_attempt
      ) p
    ),
    'expired', exists (
      select 1 from launchloom_operations.activity_expired z
       where z.namespace = p_namespace and z.attempt_id = p_attempt
    ),
    'coverage', coalesce((
      select json_agg(c order by c.boundary)
        from launchloom_operations.activity_coverage c
       where c.namespace = p_namespace and c.attempt_id = p_attempt
    ), '[]'::json),
    'usage', (
      select row_to_json(u) from (
        select count(*)::integer as responses,
               count(*) filter (
                 where input_tokens is null and output_tokens is null
                   and cached_input_tokens is null and cache_write_tokens is null
                   and reasoning_tokens is null
               )::integer as unknown_responses,
               sum(input_tokens)::text as input_tokens,
               sum(output_tokens)::text as output_tokens,
               sum(cached_input_tokens)::text as cached_input_tokens,
               sum(cache_write_tokens)::text as cache_write_tokens,
               sum(reasoning_tokens)::text as reasoning_tokens,
               sum(cost_usd) filter (where cost_kind = 'actual')::text as actual_cost,
               sum(cost_usd) filter (where cost_kind = 'estimated')::text as estimated_cost,
               case when count(*) filter (where cost_kind <> 'unreported') > 0
                    then 'USD' end as cost_currency,
               count(*) filter (where cost_kind = 'unreported')::integer as unreported_cost
          from launchloom_operations.activity_usage
         where namespace = p_namespace and attempt_id = p_attempt
      ) u
    ),
    'events', coalesce((
      select json_agg(e order by e.cursor desc) from (
        select cursor, event_id, kind, producer_sequence, context, payload,
               (extract(epoch from emitted_at) * 1000)::double precision as emitted_ms,
               (extract(epoch from received_at) * 1000)::double precision as received_ms
          from launchloom_operations.activity_events
         where namespace = p_namespace and attempt_id = p_attempt
           and (p_after is null or cursor > p_after)
           and (p_before is null or cursor < p_before)
         order by cursor desc
         limit p_limit + 1
      ) e
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION launchloom_operations.read_activity(text, text, integer, integer, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_operations_worker') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA launchloom_operations FROM launchloom_operations_worker;
    GRANT USAGE ON SCHEMA launchloom_operations TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.append_activity_events(text, text, text, text, integer, jsonb) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.read_activity(text, text, integer, integer, integer) TO launchloom_operations_worker;
    GRANT EXECUTE ON FUNCTION launchloom_operations.prune_activity(integer) TO launchloom_operations_worker;
  END IF;
END;
$$;
COMMIT;
