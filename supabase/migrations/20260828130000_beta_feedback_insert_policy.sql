-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — beta_feedback insert policy
-- ─────────────────────────────────────────────────────────────────
-- beta-feedback.html submits directly to public.beta_feedback using the
-- anon key (no login required). RLS was enabled on this table with zero
-- policies, so every insert has been silently rejected since the table
-- was created — the form still shows "thank you" because the separate
-- send-feedback-email edge function call succeeds independently, masking
-- the failure. This adds a write-only insert policy (no select/update/
-- delete for the public) so submissions actually save; reading the data
-- back continues to go through the Supabase dashboard / service role,
-- which already bypasses RLS.
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "Public can submit beta feedback"
  ON public.beta_feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
