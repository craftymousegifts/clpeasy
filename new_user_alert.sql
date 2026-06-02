-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — New User Alert System
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. PROFILES TABLE (if not already exists) ─────────────────
-- Mirrors auth.users with extra CLPeasy fields
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  is_beta         BOOLEAN DEFAULT FALSE,
  trial_ends      TIMESTAMPTZ,
  plan            TEXT DEFAULT 'trial',   -- trial | start | pro | cancelled | paused
  notified_signup BOOLEAN DEFAULT FALSE,  -- have we sent the signup alert?
  converted_at    TIMESTAMPTZ,            -- when they upgraded from trial
  trial_ended_at  TIMESTAMPTZ             -- when their trial expired without converting
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── 2. TRIGGER FUNCTION — fires on every new auth.users row ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_end TIMESTAMPTZ;
  is_beta_user BOOLEAN;
BEGIN
  -- Set 14-day trial end
  trial_end := NOW() + INTERVAL '14 days';
  
  -- Check if email is in beta list
  is_beta_user := NEW.email IN (
    -- Replace with Roy, Susan and Lisa's actual emails
    'roy@replaceme.com',
    'susan@replaceme.com',
    'lisa@replaceme.com'
  );

  -- If beta, extend trial to 30 days
  IF is_beta_user THEN
    trial_end := NOW() + INTERVAL '30 days';
  END IF;

  -- Insert profile row
  INSERT INTO public.profiles (id, email, trial_ends, is_beta, plan)
  VALUES (NEW.id, NEW.email, trial_end, is_beta_user, 'trial');

  -- Fire the new user notification edge function
  PERFORM net.http_post(
    url := 'https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/notify-new-user',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object(
      'email', NEW.email,
      'user_id', NEW.id,
      'is_beta', is_beta_user,
      'trial_ends', trial_end,
      'created_at', NOW()
    )
  );

  RETURN NEW;
END;
$$;

-- ── 3. ATTACH TRIGGER TO auth.users ───────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. TRIAL DROP-OFF VIEW ─────────────────────────────────────
-- Shows users whose trial expired without converting
CREATE OR REPLACE VIEW public.trial_dropoffs AS
SELECT 
  p.id,
  p.email,
  p.created_at,
  p.trial_ends,
  p.plan,
  p.is_beta,
  NOW() - p.trial_ends AS expired_ago,
  CASE 
    WHEN NOW() > p.trial_ends AND p.plan = 'trial' THEN 'expired_no_convert'
    WHEN NOW() < p.trial_ends AND p.plan = 'trial' THEN 'active_trial'
    WHEN p.plan IN ('start','pro') THEN 'converted'
    WHEN p.plan = 'cancelled' THEN 'cancelled'
    ELSE p.plan
  END AS status
FROM public.profiles p
ORDER BY p.trial_ends DESC;

-- ── 5. GRANT beta access to specific emails ───────────────────
-- Run this separately once you have Roy, Susan, Lisa's actual emails:
-- UPDATE public.profiles 
-- SET is_beta = true, trial_ends = NOW() + INTERVAL '30 days'
-- WHERE email IN ('roy@...', 'susan@...', 'lisa@...');

