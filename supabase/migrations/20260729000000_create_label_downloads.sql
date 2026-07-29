-- 7-day re-download grace period.
--
-- Tracks, per user and per label, when that label was last downloaded, so
-- builder.html can tell a genuine new download (consumes 1 credit) apart
-- from a re-download of the same label within 7 days (free) across any
-- browser or device — not just localStorage on one machine.
--
-- label_key is a stable identifier derived client-side from the label's
-- scent name + product type (normalised), matching the identity the app
-- already uses elsewhere to recognise "the same label" (see builder.html's
-- saveLabel history-matching hook). It is NOT a random id that changes on
-- every download.

create table public.label_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label_key text not null,
  last_downloaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, label_key)
);

create index label_downloads_user_key_idx on public.label_downloads (user_id, label_key);

alter table public.label_downloads enable row level security;

-- Same trust model already used for profiles/subscriptions: the signed-in
-- user can read and write only their own rows, directly from the browser via
-- the anon key + their session JWT (builder.html has no server-side function
-- in this path today, so this matches the existing pattern rather than
-- introducing a new one).
create policy "Users can view own label downloads" on public.label_downloads
  for select using (auth.uid() = user_id);

create policy "Users can insert own label downloads" on public.label_downloads
  for insert with check (auth.uid() = user_id);

create policy "Users can update own label downloads" on public.label_downloads
  for update using (auth.uid() = user_id);
