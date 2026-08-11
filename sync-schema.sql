-- ============================================================
--  Patron / Liam — cross-device sync, v3 schema.
--
--  Run ONCE in your Supabase project: SQL Editor → New query → paste → Run.
--  Safe to re-run. It does NOT touch the old app_state table — the app reads
--  that once to migrate your existing data, then leaves it alone as a backup.
--
--  What changes vs v2:
--    * one row PER KEY instead of one row for the whole device, so two devices
--      editing different pages never touch the same row;
--    * a monotonic `seq` cursor, so a device pulls only what changed since it
--      last looked instead of the entire dataset;
--    * `rev` + compare-and-set on write, so a push that was based on stale data
--      is REJECTED and merged rather than silently overwriting;
--    * row-level security keyed to your login. The old policy was
--      `using (true) with check (true)` — the anon key is public, so anyone who
--      viewed source could read and rewrite everything in the table.
-- ============================================================

-- ---------- 1. the data table ----------
create table if not exists sync_items (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null,                 -- the localStorage key, e.g. 'water_standalone_v1'
  value      text,                                 -- the raw stored string; null when deleted
  deleted    boolean     not null default false,   -- tombstone, so a delete propagates instead of resurrecting
  rev        integer     not null default 1,       -- bumped on every accepted write; the compare-and-set token
  lamport    bigint      not null default 0,       -- causal clock, breaks ties when two devices edit at once
  device_id  text,                                 -- who wrote it last (display + deterministic tiebreak)
  seq        bigint      not null,                 -- server-assigned, monotonic: the pull cursor
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- `seq` comes from one global sequence. A plain bigserial only advances on
-- INSERT; we need a new number on every UPDATE too, or an edited row would never
-- show up in another device's "everything after cursor N" query.
create sequence if not exists sync_seq;

create or replace function sync_touch() returns trigger language plpgsql as $$
begin
  new.seq := nextval('sync_seq');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sync_items_touch on sync_items;
create trigger sync_items_touch before insert or update on sync_items
  for each row execute function sync_touch();

-- The one query the client runs constantly: "my rows, after this cursor".
create index if not exists sync_items_cursor on sync_items (user_id, seq);

-- ---------- 2. row-level security ----------
-- Your rows, and only your rows. auth.uid() comes from the signed-in session,
-- not from anything the browser can assert on its own.
alter table sync_items enable row level security;

drop policy if exists "sync_items own rows" on sync_items;
create policy "sync_items own rows" on sync_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- 3. the write endpoint: compare-and-set ----------
-- Every item carries the `rev` it was based on. If the server has moved on, we
-- do NOT write — we hand the current row back and let the client merge and
-- retry. That is what makes "device B overwrote device A" structurally
-- impossible: B's write only lands if B had already seen A's.
--
-- security invoker: RLS above still applies inside the function.
create or replace function sync_push(p_items jsonb, p_device text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  it        jsonb;
  cur       sync_items%rowtype;
  uid       uuid := auth.uid();
  accepted  jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'sync_push: not authenticated';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    -- FOR UPDATE: two devices pushing the same key at the same moment queue up
    -- here instead of both reading rev 4 and both writing rev 5.
    select * into cur from sync_items
      where user_id = uid and key = it->>'key'
      for update;

    if not found then
      insert into sync_items (user_id, key, value, deleted, rev, lamport, device_id)
      values (uid, it->>'key', it->>'value',
              coalesce((it->>'deleted')::boolean, false), 1,
              coalesce((it->>'lamport')::bigint, 0), p_device)
      returning * into cur;
      accepted := accepted || jsonb_build_object('key', cur.key, 'rev', cur.rev, 'seq', cur.seq, 'lamport', cur.lamport);

    elsif cur.rev = coalesce((it->>'base_rev')::int, -1) then
      update sync_items set
        value     = it->>'value',
        deleted   = coalesce((it->>'deleted')::boolean, false),
        rev       = cur.rev + 1,
        lamport   = greatest(cur.lamport, coalesce((it->>'lamport')::bigint, 0)),
        device_id = p_device
      where user_id = uid and key = cur.key
      returning * into cur;
      accepted := accepted || jsonb_build_object('key', cur.key, 'rev', cur.rev, 'seq', cur.seq, 'lamport', cur.lamport);

    else
      -- Stale base_rev. Hand back what we actually hold; the client three-way
      -- merges it against its own edit and pushes again with the fresh rev.
      conflicts := conflicts || jsonb_build_object(
        'key', cur.key, 'rev', cur.rev, 'value', cur.value, 'deleted', cur.deleted,
        'lamport', cur.lamport, 'seq', cur.seq, 'device_id', cur.device_id);
    end if;
  end loop;

  return jsonb_build_object('accepted', accepted, 'conflicts', conflicts);
end $$;

-- ---------- 4. realtime ----------
-- Lets other devices react in ~a second instead of waiting for the poll.
-- Sync still works without it, just with a 60s worst case.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_items'
  ) then
    alter publication supabase_realtime add table sync_items;
  end if;
end $$;

-- ---------- 5. photo storage ----------
-- Unchanged from v2 except that writes now require a login. The bucket stays
-- public-read because the app displays photos by URL; treat anything you upload
-- as world-readable-if-the-URL-leaks.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

drop policy if exists "progress read"   on storage.objects;
drop policy if exists "progress write"  on storage.objects;
drop policy if exists "progress delete" on storage.objects;
create policy "progress read"   on storage.objects for select
  using (bucket_id = 'progress-photos');
create policy "progress write"  on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos');
create policy "progress delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos');

-- ---------- 6. lock down the old table ----------
-- Your v2 data stays readable so the app can migrate it, but nobody can write
-- to it any more. Delete the table yourself once you've confirmed the migration.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'app_state') then
    execute 'drop policy if exists "app_state rw" on app_state';
    execute 'drop policy if exists "app_state legacy read" on app_state';
    execute 'create policy "app_state legacy read" on app_state for select using (true)';
  end if;
end $$;

-- Done. Then in Supabase → Authentication → Providers, make sure Email is on
-- (magic link / OTP). Each device signs in once; that login is what scopes the
-- rows above to you.
