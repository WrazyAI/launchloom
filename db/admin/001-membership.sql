-- LaunchLoom admin identity: application membership, enrollment and owner safety.
-- Applied to the launchloom_admin database only. The Worker connects with the
-- private launchloom_admin role; this schema is not exposed through Data API.

CREATE SCHEMA IF NOT EXISTS launchloom_admin;

CREATE TABLE IF NOT EXISTS launchloom_admin.workspace_guard (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO launchloom_admin.workspace_guard (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS launchloom_admin.members (
  subject text PRIMARY KEY,
  email text NOT NULL,
  display_name text,
  avatar_key text,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 100)),
  CHECK (avatar_key IS NULL OR char_length(avatar_key) BETWEEN 1 AND 64)
);
CREATE UNIQUE INDEX IF NOT EXISTS members_active_email
  ON launchloom_admin.members (lower(email)) WHERE active;
CREATE INDEX IF NOT EXISTS members_active_role
  ON launchloom_admin.members (active, role);

CREATE TABLE IF NOT EXISTS launchloom_admin.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES launchloom_admin.members (subject),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_subject text REFERENCES launchloom_admin.members (subject),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrollments_email_open
  ON launchloom_admin.enrollments (lower(email), expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS launchloom_admin.membership_audit (
  id bigserial PRIMARY KEY,
  actor_subject text,
  action text NOT NULL,
  target_subject text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS launchloom_admin.legacy_identity_links (
  legacy_id text PRIMARY KEY,
  subject text NOT NULL REFERENCES launchloom_admin.members (subject),
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION launchloom_admin.get_member(p_subject text)
RETURNS SETOF launchloom_admin.members
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
  SELECT * FROM launchloom_admin.members WHERE subject = p_subject;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.find_active_member(p_subject text)
RETURNS SETOF launchloom_admin.members
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
  SELECT * FROM launchloom_admin.members WHERE subject = p_subject AND active;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.list_members()
RETURNS SETOF launchloom_admin.members
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
  SELECT * FROM launchloom_admin.members
  ORDER BY active DESC, (role = 'owner') DESC, lower(coalesce(display_name, email));
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.create_enrollment(
  p_email text,
  p_token_hash text,
  p_created_by text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_actor launchloom_admin.members%ROWTYPE;
  v_id uuid;
BEGIN
  -- Serialize membership writes before authorizing the actor. Otherwise an
  -- owner could be deactivated while this call waits, then still mint invites.
  PERFORM 1 FROM launchloom_admin.workspace_guard WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace_guard_missing';
  END IF;
  SELECT * INTO v_actor FROM launchloom_admin.members
    WHERE subject = p_created_by AND active AND role = 'owner';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(trim(p_email)) < 3 OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF p_expires_at <= now() OR p_expires_at > now() + interval '14 days' THEN
    RAISE EXCEPTION 'invalid_expiry';
  END IF;
  INSERT INTO launchloom_admin.enrollments (email, token_hash, created_by, expires_at)
    VALUES (lower(trim(p_email)), p_token_hash, p_created_by, p_expires_at)
    RETURNING id INTO v_id;
  INSERT INTO launchloom_admin.membership_audit (actor_subject, action, detail)
    VALUES (p_created_by, 'enrollment_created', jsonb_build_object('email', lower(trim(p_email)), 'enrollment_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.accept_enrollment(
  p_token_hash text,
  p_subject text,
  p_email text,
  p_display_name text DEFAULT NULL,
  p_legacy_id text DEFAULT NULL
) RETURNS launchloom_admin.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_enrollment launchloom_admin.enrollments%ROWTYPE;
  v_member launchloom_admin.members%ROWTYPE;
BEGIN
  IF p_legacy_id IS NOT NULL AND p_legacy_id !~ '^access:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_legacy_id';
  END IF;
  SELECT * INTO v_enrollment FROM launchloom_admin.enrollments
    WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_enrollment';
  END IF;
  IF v_enrollment.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'enrollment_used';
  END IF;
  IF v_enrollment.expires_at <= now() THEN
    RAISE EXCEPTION 'enrollment_expired';
  END IF;
  IF lower(v_enrollment.email) <> lower(trim(p_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;
  SELECT * INTO v_member FROM launchloom_admin.members
    WHERE subject = p_subject FOR UPDATE;
  IF FOUND THEN
    IF NOT v_member.active OR lower(v_member.email) <> lower(trim(p_email)) THEN
      RAISE EXCEPTION 'member_conflict';
    END IF;
    IF p_display_name IS NOT NULL AND char_length(trim(p_display_name)) > 0 THEN
      UPDATE launchloom_admin.members
        SET display_name = left(trim(p_display_name), 100), updated_at = now()
        WHERE subject = p_subject
        RETURNING * INTO v_member;
    END IF;
  ELSE
    INSERT INTO launchloom_admin.members (subject, email, display_name, role)
      VALUES (p_subject, lower(trim(p_email)), nullif(left(trim(coalesce(p_display_name, '')), 100), ''), 'admin')
      RETURNING * INTO v_member;
  END IF;
  -- The link, member insert and token consumption share this transaction. A
  -- conflict or missing link function rolls all three back.
  IF p_legacy_id IS NOT NULL THEN
    PERFORM launchloom_admin.link_legacy_identity(p_legacy_id, p_subject);
  END IF;
  UPDATE launchloom_admin.enrollments
    SET consumed_at = now(), consumed_subject = p_subject
    WHERE id = v_enrollment.id;
  INSERT INTO launchloom_admin.membership_audit (actor_subject, action, target_subject, detail)
    VALUES (null, 'enrollment_accepted', p_subject, jsonb_build_object('enrollment_id', v_enrollment.id));
  RETURN v_member;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.bootstrap_owner(
  p_subject text,
  p_email text,
  p_display_name text DEFAULT NULL,
  p_legacy_id text DEFAULT NULL
) RETURNS launchloom_admin.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_member launchloom_admin.members%ROWTYPE;
BEGIN
  IF p_legacy_id IS NOT NULL AND p_legacy_id !~ '^access:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_legacy_id';
  END IF;
  PERFORM 1 FROM launchloom_admin.workspace_guard WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace_guard_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM launchloom_admin.members WHERE active AND role = 'owner') THEN
    RAISE EXCEPTION 'owner_exists';
  END IF;
  INSERT INTO launchloom_admin.members (subject, email, display_name, role, active)
    VALUES (p_subject, lower(trim(p_email)), nullif(left(trim(coalesce(p_display_name, '')), 100), ''), 'owner', true)
    RETURNING * INTO v_member;
  IF p_legacy_id IS NOT NULL THEN
    PERFORM launchloom_admin.link_legacy_identity(p_legacy_id, p_subject);
  END IF;
  INSERT INTO launchloom_admin.membership_audit (action, target_subject)
    VALUES ('owner_bootstrapped', p_subject);
  RETURN v_member;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.change_member(
  p_actor text,
  p_target text,
  p_role text DEFAULT NULL,
  p_active boolean DEFAULT NULL
) RETURNS launchloom_admin.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_actor launchloom_admin.members%ROWTYPE;
  v_target launchloom_admin.members%ROWTYPE;
  v_owner_count integer;
BEGIN
  -- Lock the singleton guard before reading the actor so a concurrent
  -- deactivation cannot leave a stale owner able to mutate the team.
  PERFORM 1 FROM launchloom_admin.workspace_guard WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace_guard_missing';
  END IF;
  SELECT * INTO v_actor FROM launchloom_admin.members
    WHERE subject = p_actor AND active AND role = 'owner';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF p_role IS NULL AND p_active IS NULL THEN
    RAISE EXCEPTION 'no_change';
  END IF;
  SELECT * INTO v_target FROM launchloom_admin.members WHERE subject = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_target.active AND v_target.role = 'owner'
     AND ((p_role IS NOT NULL AND p_role <> 'owner') OR p_active IS FALSE) THEN
    SELECT count(*) INTO v_owner_count FROM launchloom_admin.members WHERE active AND role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
  END IF;
  UPDATE launchloom_admin.members
    SET role = coalesce(p_role, role),
        active = coalesce(p_active, active),
        updated_at = now()
    WHERE subject = p_target
    RETURNING * INTO v_target;
  INSERT INTO launchloom_admin.membership_audit (actor_subject, action, target_subject, detail)
    VALUES (p_actor, 'member_changed', p_target, jsonb_build_object('role', p_role, 'active', p_active));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION launchloom_admin.update_profile(
  p_subject text,
  p_display_name text DEFAULT NULL,
  p_avatar_key text DEFAULT NULL
) RETURNS launchloom_admin.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_member launchloom_admin.members%ROWTYPE;
BEGIN
  IF p_display_name IS NOT NULL AND char_length(trim(p_display_name)) > 100 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;
  UPDATE launchloom_admin.members
    SET display_name = CASE WHEN p_display_name IS NULL THEN display_name ELSE nullif(left(trim(p_display_name), 100), '') END,
        avatar_key = coalesce(p_avatar_key, avatar_key),
        updated_at = now()
    WHERE subject = p_subject AND active
    RETURNING * INTO v_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  INSERT INTO launchloom_admin.membership_audit (actor_subject, action, target_subject)
    VALUES (p_subject, 'profile_updated', p_subject);
  RETURN v_member;
END;
$$;

-- Execute-only access for the server-side Worker role. Functions are SECURITY
-- DEFINER, so the Worker needs EXECUTE and schema USAGE but no direct table or
-- sequence privileges. The conditional block keeps this migration applicable to
-- a fresh database before the operator has created that role.
REVOKE ALL ON SCHEMA launchloom_admin FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA launchloom_admin FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA launchloom_admin FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA launchloom_admin FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_worker') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA launchloom_admin TO launchloom_worker';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA launchloom_admin TO launchloom_worker';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA launchloom_admin GRANT EXECUTE ON FUNCTIONS TO launchloom_worker';
  END IF;
END;
$$;
