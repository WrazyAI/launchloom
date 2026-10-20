-- Accounts Task 6 fix: make the legacy identity link atomic with enrollment
-- acceptance and first-owner bootstrap. Replaces only the two functions; no
-- table, row, index or data is dropped.

-- The original four-argument acceptance function is superseded by the
-- five-argument form below. Dropping the old overload is required because
-- PostgreSQL cannot change an argument list with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS launchloom_admin.accept_enrollment(text, text, text, text);
DROP FUNCTION IF EXISTS launchloom_admin.bootstrap_owner(text, text, text);

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
  -- Member insert, legacy link and token consumption share one transaction.
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

REVOKE ALL ON FUNCTION launchloom_admin.accept_enrollment(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION launchloom_admin.bootstrap_owner(text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_worker') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION launchloom_admin.accept_enrollment(text, text, text, text, text) TO launchloom_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION launchloom_admin.bootstrap_owner(text, text, text, text) TO launchloom_worker';
  END IF;
END;
$$;
