-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — Trial Drop-off Check
-- Run manually in Supabase SQL Editor to see who hasn't converted
-- ═══════════════════════════════════════════════════════════════

-- See all current trial users and their status
SELECT 
  email,
  created_at::DATE as joined,
  trial_ends::DATE as trial_ends,
  plan,
  is_beta,
  CASE 
    WHEN plan IN ('start','pro') THEN '✅ Converted'
    WHEN plan = 'cancelled' THEN '❌ Cancelled'
    WHEN plan = 'paused' THEN '⏸ Paused'
    WHEN NOW() > trial_ends AND plan = 'trial' THEN '⚠️ Expired — not converted'
    WHEN NOW() < trial_ends AND plan = 'trial' THEN '🕐 Active trial (' || 
      CEIL(EXTRACT(EPOCH FROM (trial_ends - NOW())) / 86400)::TEXT || ' days left)'
    ELSE plan
  END as status
FROM public.profiles
ORDER BY trial_ends ASC;

-- ── DROP-OFF USERS READY FOR WIN-BACK EMAIL ────────────────────
-- Users whose trial expired in the last 30 days without converting
SELECT email, trial_ends::DATE as expired_on,
  CEIL(EXTRACT(EPOCH FROM (NOW() - trial_ends)) / 86400)::TEXT || ' days ago' as expired
FROM public.profiles
WHERE plan = 'trial'
  AND trial_ends < NOW()
  AND trial_ends > NOW() - INTERVAL '30 days'
ORDER BY trial_ends DESC;

-- ── CONVERSION RATE ────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE plan IN ('start','pro')) as converted,
  COUNT(*) FILTER (WHERE plan = 'trial' AND trial_ends < NOW()) as expired_no_convert,
  COUNT(*) FILTER (WHERE plan = 'trial' AND trial_ends > NOW()) as active_trials,
  COUNT(*) as total_users,
  ROUND(
    COUNT(*) FILTER (WHERE plan IN ('start','pro'))::NUMERIC / 
    NULLIF(COUNT(*),0) * 100, 1
  ) as conversion_rate_pct
FROM public.profiles;
