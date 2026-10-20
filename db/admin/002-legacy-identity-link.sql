-- Accounts Task 6: additive legacy-to-Neon identity association.
-- Applied after 001-membership.sql. Creates no table and drops no data.

CREATE OR REPLACE FUNCTION launchloom_admin.link_legacy_identity(
  p_legacy_id text,
  p_subject text
) RETURNS launchloom_admin.legacy_identity_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = launchloom_admin, pg_temp
AS $$
DECLARE
  v_member launchloom_admin.members%ROWTYPE;
  v_link launchloom_admin.legacy_identity_links%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  IF p_legacy_id IS NULL OR p_legacy_id !~ '^access:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_legacy_id';
  END IF;
  IF p_subject IS NULL OR char_length(trim(p_subject)) < 1 OR char_length(p_subject) > 200 THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;
  SELECT * INTO v_member FROM launchloom_admin.members
    WHERE subject = trim(p_subject) AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO launchloom_admin.legacy_identity_links (legacy_id, subject)
    VALUES (p_legacy_id, trim(p_subject))
    ON CONFLICT (legacy_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_link FROM launchloom_admin.legacy_identity_links
    WHERE legacy_id = p_legacy_id;
  IF v_link.subject <> trim(p_subject) THEN
    RAISE EXCEPTION 'legacy_identity_conflict';
  END IF;
  IF v_inserted > 0 THEN
    INSERT INTO launchloom_admin.membership_audit (actor_subject, action, target_subject, detail)
      VALUES (null, 'legacy_identity_linked', trim(p_subject), jsonb_build_object('legacy_id', p_legacy_id));
  END IF;
  RETURN v_link;
END;
$$;

REVOKE ALL ON FUNCTION launchloom_admin.link_legacy_identity(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_worker') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION launchloom_admin.link_legacy_identity(text, text) TO launchloom_worker';
  END IF;
END;
$$;
