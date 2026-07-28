# Supabase setup — sync phone + PC

Follow top to bottom. Do steps 1–4 ONCE. Do step 5 on BOTH devices.

## 1. Account
- Open: https://supabase.com
- Sign / log in with GitHub

## 2. New project
- Click **New project**
- Name it whatever your folder is (Patron-Liam2)
- Set a database password (save it somewhere)
- Pick the closest region → **Create**
- Wait ~1 min for it to finish

## 3. Run the SQL
- Left sidebar → **SQL Editor** → **New query**
- Paste the SQL block below → click **Run**
- Should say "Success"

```sql
-- DATA TABLE
create table if not exists app_state (
  key        text primary key,
  data       jsonb,
  updated_at timestamptz default now()
);
alter table app_state enable row level security;
drop policy if exists "app_state rw" on app_state;
create policy "app_state rw" on app_state for all using (true) with check (true);

-- PHOTO STORAGE BUCKET
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- PHOTO PERMISSIONS
drop policy if exists "progress read"   on storage.objects;
drop policy if exists "progress write"  on storage.objects;
drop policy if exists "progress delete" on storage.objects;
create policy "progress read"   on storage.objects for select using (bucket_id = 'progress-photos');
create policy "progress write"  on storage.objects for insert with check (bucket_id = 'progress-photos');
create policy "progress delete" on storage.objects for delete using (bucket_id = 'progress-photos');

-- REALTIME (instant cross-device updates)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table app_state;
  end if;
end $$;
```

## 4. Get your 2 keys
- Left sidebar → **Project Settings** (gear) → **API**
- Copy **Project URL**  (looks like https://xxxx.supabase.co)
- Copy **anon public** key  (NOT the service_role key)

## 5. Connect each device (do on PHONE and PC)
- Open the app, tap **☁ Cloud sync** (bottom-right)
- Click **"Advanced: use your own Supabase project"**
- Paste **Project URL** + **anon key** → **Save & sync**
- Button turns green → **☁ Synced**

## 6. First merge
- Device that HAS your data → ☁ → **⤒ Push this device up**
- Other device → ☁ → **⤓ Pull cloud down**

Done. Finance, water, gym, goals, supplements + progress photos now sync across phone + PC automatically.
