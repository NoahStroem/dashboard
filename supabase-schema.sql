-- ============================================================
--  Patron / Liam — complete Supabase setup.
--  Run this ONCE in your Supabase project:  SQL Editor → New query → paste → Run.
--  It sets up BOTH:
--    1. the data table  (everything except photos: finance, water, gym, goals…)
--    2. the photo storage bucket + permissions  (progress pictures)
--  No login system — your project's keys are your identity. Re-running is safe.
-- ============================================================

-- 1) DATA — one table holds every page's saved state as JSON, keyed by page.
create table if not exists app_state (
  key        text primary key,
  data       jsonb,
  updated_at timestamptz default now()
);
alter table app_state enable row level security;
drop policy if exists "app_state rw" on app_state;
create policy "app_state rw" on app_state for all using (true) with check (true);

-- 2) PHOTOS — a Storage bucket for progress pictures (this is the part that
--    breaks when photos get stuffed into the table/browser instead).
--    public = true so the app can display them by URL.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- 3) PHOTO PERMISSIONS — allow the app to upload / view / delete in that bucket.
drop policy if exists "progress read"   on storage.objects;
drop policy if exists "progress write"  on storage.objects;
drop policy if exists "progress delete" on storage.objects;
create policy "progress read"   on storage.objects for select using (bucket_id = 'progress-photos');
create policy "progress write"  on storage.objects for insert with check (bucket_id = 'progress-photos');
create policy "progress delete" on storage.objects for delete using (bucket_id = 'progress-photos');

-- 4) REALTIME — lets your other devices receive snapshot updates instantly
--    (without this, sync still works but only when you re-open / refocus a tab).
--    Safe to re-run: only adds the table if it isn't already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table app_state;
  end if;
end $$;

-- Done. Set SUPABASE_URL + SUPABASE_ANON_KEY as Vercel env vars (Settings → API
-- gives you both), redeploy, and every device syncs automatically.
