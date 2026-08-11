# Cross-device sync

Your data follows you between phone, laptop, tablet and desktop. Every page works
fully offline; changes upload themselves when there's a connection, and when two
devices change things at once, both changes survive.

This replaces the engine that, on 2026-08-10, let a laptop that had been closed
for two days delete two days of vitals typed on a phone. The section
[Why the old one lost data](#why-the-old-one-lost-data) explains exactly how, and
each fix below points back to it.

---

## The stack, and why

| Layer | Choice | Why this one |
|---|---|---|
| Local store | `localStorage` | Already the source of truth for all 20 pages. Synchronous, so pages render instantly and work with no network. Not replaced — mirrored. |
| Sync engine | `sync.js`, plain browser JS | No build step anywhere in this repo. Keeping it a single dependency-free file means a page just adds a `<script>` tag. |
| Transport | Supabase JS client → PostgREST + RPC | You're on **11 of 12** Vercel Hobby serverless functions. Four REST endpoints would blow the cap. Talking to Postgres directly costs zero functions and gets Realtime and row-level security for free. |
| Database | Supabase Postgres | Already provisioned and paid for (free tier). |
| Realtime | Supabase Realtime (Postgres logical replication) | Sub-second propagation with no polling loop and no extra service. |
| Auth | Supabase Auth, email + password | It's what scopes rows to you — see [Security](#security). Password rather than magic link because Supabase's built-in mail service won't let you edit the email template without custom SMTP, and the stock template sends a link with no code — unusable on a phone, where a link tapped in a mail app opens a different browser than the one holding the unfinished sign-in. Password needs no email delivery at all. |

Nothing here needs a server you have to run, and nothing adds a build step.

---

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  PAGES  index.html, gym.html, water.html, …                  │
│  read and write localStorage exactly as they always have     │
└───────────────┬──────────────────────────────────────────────┘
                │ writes are observed, not polled
┌───────────────▼──────────────────────────────────────────────┐
│  1. LOCAL   sync-boot.js                                     │
│     snapshots storage at load, wraps setItem/removeItem, and │
│     tags every write boot | user | engine                    │
└───────────────┬──────────────────────────────────────────────┘
┌───────────────▼──────────────────────────────────────────────┐
│  2. ENGINE  sync.js                                          │
│     outbox • cursor • pull/merge/push cycle • retry/backoff  │
│     • realtime subscription • status • auth • v2 migration   │
└───────┬──────────────────────────────┬───────────────────────┘
        │                              │
┌───────▼────────────────┐   ┌─────────▼────────────────────────┐
│ 5. CONFLICTS           │   │ 3/4. BACKEND + DATABASE          │
│    sync-merge.js       │   │    PostgREST read, sync_push()    │
│    three-way merge     │   │    RPC write, RLS, sync_items     │
└────────────────────────┘   └─────────┬────────────────────────┘
                                       │
                             ┌─────────▼────────────────────────┐
                             │ 6. REALTIME  postgres_changes     │
                             └───────────────────────────────────┘

  UI  sync-ui.js — Syncing / Synced / Offline / Failed, last synced, retry
```

Each file is independently replaceable. `sync-merge.js` is pure functions with no
I/O; `sync-ui.js` reads `PatronDB.status()` and owns no state.

---

## Database schema

One row per key per user — not one row per device.

```sql
sync_items (
  user_id    uuid        -- RLS scope; from your login, not the browser
  key        text        -- the localStorage key, e.g. 'water_standalone_v1'
  value      text        -- the raw stored string; null when deleted
  deleted    boolean     -- tombstone, so deletes propagate
  rev        integer     -- compare-and-set token, +1 per accepted write
  lamport    bigint      -- causal clock; breaks ties deterministically
  device_id  text        -- who wrote it last
  seq        bigint      -- server-assigned, monotonic: the pull cursor
  updated_at timestamptz
  primary key (user_id, key)
)
create index on sync_items (user_id, seq);
```

`seq` comes from one global sequence via a trigger, on **update as well as
insert** — a `bigserial` only advances on insert, so an edited row would never
appear in another device's "everything after cursor N" query.

Full DDL, policies and the RPC: [sync-schema.sql](sync-schema.sql).

---

## API

There is no Vercel API for sync. Two calls, straight to Postgres, both scoped by
RLS to the signed-in user.

**Pull — incremental read**

```js
sb.from('sync_items')
  .select('key,value,deleted,rev,lamport,device_id,seq')
  .gt('seq', cursor).order('seq').limit(500)
```

Returns only what changed since this device last looked. A quiet device's sync is
one indexed query returning zero rows. Pages loop until a short page comes back,
so a device that's been away for a month catches up 500 rows at a time.

**Push — compare-and-set write**

```js
sb.rpc('sync_push', {
  p_items: [{ key, value, deleted, base_rev, lamport }, …],  // ≤100 per call
  p_device: deviceId
})
// → { accepted: [{key, rev, seq, lamport}], conflicts: [{key, rev, value, …}] }
```

Every item carries the `rev` it was based on. If the server has moved past it the
write is **rejected**, and the server hands back the row it actually holds. The
client merges that against its own edit and retries with the fresh `rev`.

That single property is what makes "device B overwrote device A" structurally
impossible: B's write only lands if B had already seen A's.

The only other endpoints are `/api/config` (serves this deploy's public Supabase
URL + anon key, already existed) and Supabase Auth + Realtime, both handled by
the client library.

---

## Data flow

**You type a number**

```
page writes localStorage
  → setItem wrapper tags it 'user', engine queues it in the outbox
  → UI shows "Syncing", pending count 1
  → 800ms debounce (one request per burst of typing, not per keystroke)
  → PULL anything new → MERGE → PUSH the outbox
  → accepted: outbox cleared, UI shows "Synced · just now"
```

**Another device changes something**

```
Postgres row changes → Realtime → this device pulls rows after its cursor
  → merged into localStorage
  → PatronDB.onChange fires; pages that registered re-render in place
    (pages that didn't get a reload, never mid-typing)
```

**You're on a train**

```
writes queue in the outbox (persisted, survives a reload)
  → UI shows "Offline · 3"
  → retries back off 2s, 4s, 8s … capped at 60s, with jitter
  → 'online' event or a regained focus flushes everything
```

**Sync triggers:** a local edit (debounced), a realtime ping, tab focus or
visibility, reconnect, `pagehide`, **Sync now**, and a slow safety-net poll —
60s when realtime is down, 5 minutes when it's up.

---

## Conflict resolution

Order of decision, per key:

1. **Identical** — nothing to do.
2. **Only one side changed** since the last agreement — take that side. This is
   the overwhelming majority of "conflicts" and costs nothing.
3. **Both changed** — three-way merge against the last agreed value:
   - **Objects** merge key by key. A day added on your phone and a different day
     added on your laptop both survive. This is the shape most of this app uses
     (`{ '2026-08-10': {…} }`).
   - **Lists of entries** (every element has an `id` or a `ts`) merge by
     identity, and come back in a normalised order so both devices produce
     identical bytes.
   - **A field changed to different values on both sides** — the entry's own
     `ts` decides if it has one, otherwise the higher `lamport`, otherwise the
     higher `device_id`. Symmetric, so both devices reach the same answer.
   - **An edit beats a delete.** Losing a deletion is an annoyance; losing two
     days of entries is not.
4. **Not mergeable** (a number, a string, a setting) — last write wins, by the
   same deterministic rule.

Merging is verified **symmetric and idempotent** over 4,800 randomised cases:
if A and B ever merged the same pair to different bytes they would push at each
other forever.

Per-key overrides, if a page ever needs one:

```js
PatronMerge.strategy('gym_standalone_v1', (base, local, remote, ctx) => mergedString);
```

---

## Why the old one lost data

Three separate faults, all fixed above:

1. **One row for the whole device.** Every push rewrote every key, so any write
   was a full-device overwrite.
2. **Blind upsert.** No `rev`, no compare-and-set — a device could write over
   changes it had never seen. → now [`sync_push`](sync-schema.sql) rejects them.
3. **Start-up writes counted as your edits.** This is the one that actually did
   the damage. The vitals tile clears itself each morning, which runs *during
   page load* — long before the first network round-trip. The engine could only
   diff "storage now" against "what I last agreed with the server", so a laptop
   deleting its own stale record looked exactly like you deleting it by hand.
   Being the newest edit, it won, and the tombstone propagated to the phone.

Fix 3 is `sync-boot.js`: writes are **observed with their origin** instead of
inferred after the fact.

- `boot` — happened before the first pull landed. Cannot overwrite another
  device, and a *deletion* made during start-up is discarded outright. Its
  unique data is still merged in and uploaded, so nothing is thrown away.
- `user` — a real edit. Behaves normally.
- `engine` — the engine writing an adopted value. Not a local change at all.

---

## Security

The old table's policy was `using (true) with check (true)`. The anon key is
public — it's served from `/api/config` on a public site — so **anyone who
viewed source could read and rewrite everything in that table**: vitals,
finances, medications. That was the most serious problem in the old design, and
it's why sync now requires a login.

- **RLS** on `sync_items`: `user_id = auth.uid()`, for read and write. `auth.uid()`
  comes from a signed JWT, not from anything the browser can assert.
- **Auth**: Supabase email + password. Sign in once per device. Your password is
  the only thing between your data and anyone holding the public anon key, so
  make it a real one — the panel refuses anything under 8 characters.
- **`sync_push` is `security invoker`** — RLS still applies inside it. It cannot
  be used to reach another account's rows.
- **The anon key stays public and that's fine** — it grants nothing without a
  session. Never put the *service role* key in the browser.
- **The old `app_state` table** is left readable (so the app can migrate it) but
  no longer writable. Drop it once you've confirmed the migration.
- **Photo storage** is a public-read bucket: writes now require a login, but
  anything uploaded is world-readable to anyone with the URL.
- **Not covered:** end-to-end encryption. Supabase can read your rows. If you
  want that, encrypt `value` client-side with a passphrase-derived key — the
  engine treats values as opaque strings, so it would not need to change.

---

## Rolling it out

1. **Run the schema.** Supabase → SQL Editor → paste [sync-schema.sql](sync-schema.sql) → Run.
2. **Set up auth.** Supabase → Authentication → Providers → Email:

   - **Enable email provider**: on.
   - **Confirm email**: **off**. Otherwise creating the account sends a
     confirmation email, and you're back to the link problem below.

   That's all sync needs — you sign in with an email and a password, and no mail
   is ever sent.

   *Optional hardening:* once your account exists, turn **Allow new users to
   sign up** off. New signups only ever get their own empty rows (RLS sees to
   that), but there's no reason to leave the door open.

   *If you'd rather use magic links* — the panel still offers them under "Email
   me a link instead" — you need two more things, and Supabase's built-in mail
   service is not enough:

   - **Authentication → URL Configuration → Site URL**: your real site
     (`https://your-site.vercel.app`). It ships as `http://localhost:3000`, so
     every link in every auth email points at a machine that isn't running. Add
     the same URL under **Redirect URLs**.
   - **Custom SMTP**, then **Authentication → Emails → Magic Link**: add
     `{{ .Token }}` to the template. Templates are read-only until SMTP is
     configured, and the stock one contains only `{{ .ConfirmationURL }}` — a
     link, no code. The code is what works on a phone; a link tapped in a mail
     app opens that app's browser, not the one holding your unfinished sign-in.
3. **Deploy.** `git push`; Vercel redeploys in ~1 min.
4. **Recover the vitals first, if the phone still has them.** Before signing in
   anywhere else, open `index.html?rescue=1` on the phone — automatic sync stays
   off, so nothing is pulled down over it — then the status pill → Advanced →
   **Push this device up**.
5. **Sign in on each device.** Status pill → email + password. On the first
   device use **Create account**; everywhere else, **Sign in** with the same two.
6. **Check the migration.** Your old `app_state` blob is imported once, unioned
   with whatever the device already had. Nothing is overwritten.
7. **Drop `app_state`** in Supabase once you're happy. Keep it a week first.

---

## Writing pages against it

Nothing is required — raw `localStorage` is still tracked, and every existing
page kept working without changes. But being explicit is better:

```js
PatronDB.write(key, value)    // a real edit. Wins conflicts normally.
PatronDB.remove(key)          // a real deletion. Propagates.
PatronDB.derive(key, value)   // the page reorganising its own storage.
                              // Can never overwrite another device.
PatronDB.onChange(fn)         // remote data arrived — re-render in place
                              // instead of the fallback page reload.
PatronDB.status()             // { state, pending, lastSyncedAt, error, email }
PatronDB.syncNow()            // manual trigger
```

The one rule: **don't delete or rewrite storage while the page is loading.**
Decide at render time what's stale. `sync-boot.js` will catch you, but the fix
belongs in the page — see `freshOrArchive()` in [index.html](index.html), which
treats yesterday's vitals as empty without removing them.

Keys are skipped from sync in `_skip()` in `sync.js`: the engine's own
bookkeeping, `patron_theme` (per-device), and `peak_schedule_v1` (regenerated).

---

## If something goes wrong

| Symptom | What to do |
|---|---|
| Pill says **Sync failed** | Open it — the server's message is shown. `sync_items does not exist` means step 1 wasn't run. |
| Pill says **Offline** with a count | Nothing is lost. It uploads on reconnect. |
| Pill says **Sign in to sync** | This device has no session. |
| "That email and password don't match" on the first device | Use **Create account**, not Sign in. |
| "Project still requires email confirmation" | **Confirm email** is still on. Step 2. |
| Sign-in email lands on `localhost:3000` | **Site URL** is still the default — only affects the magic-link path. Step 2. |
| Can't edit the Magic Link template | Supabase locks templates until custom SMTP is configured. Use the password path instead. |
| One device has data the server lost | `?rescue=1` on that device, then Advanced → Push this device up. |
| You want to start one device over | Advanced → Pull server down. |
