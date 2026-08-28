-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — signup_notifications
-- ─────────────────────────────────────────────────────────────────
-- Idempotency guard for the notify-signup edge function. Every
-- trial signup currently triggers notify-signup from TWO independent
-- sources (the auth.html frontend, and the "on-user-signup" Database
-- Webhook on auth.users), which race within ~150ms of each other and
-- both send the admin "New CLPeasy trial signup" alert email —
-- producing one genuine signup but two admin emails.
--
-- This table lets notify-signup claim a user_id exactly once (via the
-- primary key) before sending the admin alert. Whichever of the two
-- calls arrives first wins the insert and sends the email; the second
-- call hits a primary-key conflict and skips the email. Not read or
-- written by anything else — Brevo contact creation/updates and the
-- customer-facing onboarding automation are unaffected, since they
-- run before this check and on every call as before.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.signup_notifications (
  user_id     UUID PRIMARY KEY,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.signup_notifications ENABLE ROW LEVEL SECURITY;
-- No policies: only the notify-signup edge function (service role key)
-- ever reads or writes this table. No client-side access is intended.
