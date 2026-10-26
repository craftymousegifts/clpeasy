-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — CLP-001: remove the hardcoded service-role JWT from the
-- sign-up webhook
-- ─────────────────────────────────────────────────────────────────
-- The "on-user-signup" Database Webhook (created in the Dashboard with
-- "add auth header with service key") stores a service_role JWT literally
-- in its trigger definition and posts the WHOLE auth.users row to the
-- notify-signup Edge Function.
--
-- This migration replaces it, in one transaction, with:
--   * a random shared secret generated here, server-side, and kept only in
--     Supabase Vault (no secret value appears in this file, Git, or logs);
--   * verify_notify_signup_secret(): service_role-only check used by the
--     notify-signup function to authenticate the caller;
--   * notify_signup_webhook(): an AFTER INSERT trigger on auth.users that
--     sends only id, email and created_at, plus the secret header, via
--     pg_net. It never raises, so it can never block a sign-up.
-- The old trigger is dropped last, so there is no gap. If the drop is not
-- permitted (see step 4) both run briefly; notify-signup's claim table stops
-- a second admin alert and the Brevo upsert is idempotent.
--
-- Function URL: Vault secret 'notify_signup_function_url' if present (used
-- by the CLPeasy Test project), otherwise the production URL.
-- Rollback: see docs/reports/CLP-001-SIGNUP-WEBHOOK-SECURITY-2026-10-24.md.
-- ═══════════════════════════════════════════════════════════════

-- 1. Shared secret (created once; re-running the migration keeps it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_signup_webhook_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'notify_signup_webhook_secret',
      'CLP-001: shared secret, on-user-signup trigger -> notify-signup Edge Function'
    );
  END IF;
END
$$;

-- 2. Caller check for the notify-signup Edge Function.
--    Compares SHA-256 digests so the comparison time does not depend on
--    how many leading characters match.
CREATE OR REPLACE FUNCTION public.verify_notify_signup_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_expected
    FROM vault.decrypted_secrets
   WHERE name = 'notify_signup_webhook_secret';
  IF v_expected IS NULL THEN
    RETURN false;
  END IF;
  RETURN extensions.digest(p_secret, 'sha256') = extensions.digest(v_expected, 'sha256');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_notify_signup_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_notify_signup_secret(text) TO service_role;

-- 3. Sign-up trigger function. Data minimised: no password hash, tokens
--    or metadata leave the database.
CREATE OR REPLACE FUNCTION public.notify_signup_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'notify_signup_webhook_secret';
    IF v_secret IS NULL THEN
      RAISE WARNING 'notify_signup_webhook: webhook secret missing, sign-up notification skipped';
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets
     WHERE name = 'notify_signup_function_url';
    v_url := coalesce(v_url, 'https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/notify-signup');

    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'type',   'INSERT',
                   'schema', 'auth',
                   'table',  'users',
                   'record', jsonb_build_object('id', NEW.id, 'email', NEW.email, 'created_at', NEW.created_at)
                 ),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-clpeasy-webhook-secret', v_secret
                 ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block a sign-up because the notification could not be queued.
    RAISE WARNING 'notify_signup_webhook: notification not queued (%)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_signup_webhook() FROM PUBLIC, anon, authenticated;

-- 4. Swap the triggers in the same transaction.
DROP TRIGGER IF EXISTS notify_signup_webhook ON auth.users;
CREATE TRIGGER notify_signup_webhook
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_signup_webhook();

-- auth.users is owned by supabase_auth_admin. If this role may not drop the
-- Dashboard-created trigger, keep the migration (the new trigger is safe to
-- run alongside it) and delete the webhook in Dashboard -> Database ->
-- Webhooks instead. The release checklist verifies which case occurred.
DO $$
BEGIN
  DROP TRIGGER IF EXISTS "on-user-signup" ON auth.users;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'CLP-001: could not drop "on-user-signup" (%). Delete the on-user-signup webhook in Dashboard -> Database -> Webhooks.', SQLERRM;
END
$$;
