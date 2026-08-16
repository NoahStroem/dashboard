# Liam — a self-hosted personal dashboard

A suite of single-file apps tied together by one bento **hub** (`index.html`),
one design system ("Patron" — soft-dark electric-violet), and one shared theme.
Fork it, deploy it (or just open it), make it yours.

### 🗓️ Download the Schedule Lab (one standalone file)

The **Schedule Lab** is a single self-contained `.html` file — no install, no account,
works on any computer:

1. Open it on GitHub: **[schedule-lab.html](https://github.com/liamwiseeEEEee/Patron-Rowan4/blob/main/schedule-lab.html)** → click the **Download raw file** button (the ⬇ icon, top-right of the file).
   _Or, from the live app, just click the **⬇ Download** button in the Schedule Lab's top bar._
2. **Double-click the downloaded `schedule-lab.html`** — it opens in your browser and runs.

Everything runs locally; nothing is uploaded.

### 🚀 Get your own copy live in one click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ohwisey/patron)

Click the button → it copies this repo to your GitHub and deploys it automatically.
No fork, no setup — you get a live `your-app.vercel.app` link in about a minute.
(Optional API keys for fitness-band & creator sync: see **`SETUP.md`**.)

| App | File | What it does |
|---|---|---|
| **Hub** | `index.html` | Bento launcher · onboarding · "Today's vitals" · live stats |
| Finance | `finance.html` | Net worth, subscriptions, orders (+ live FX, optional stock prices, AI statement import) |
| Gym | `gym.html` | Progressive-overload coach (optional cloud sync via *your own* Supabase) |
| Supplements | `supplements.html` | Your stack + a profile-driven recommender |
| Whoop | `whoop.html` | Recovery / sleep / strain / HRV (real Whoop OAuth when deployed) |
| Water | `water.html` | Daily hydration target |
| Creator | `creator.html` | Posting schedule, accounts, analytics |
| Goals | `goals.html` | Goals & streaks |
| Progress | `progress.html` | Weight log + progress photos |
| Social | `social.html` | Force-directed graph of the people you know + contact log |

## Social — the people graph

`social.html` is an Obsidian-style graph of the people you know. Nodes are
people, edges are how they're connected, and the colour of a node is **how long
it's been since you last spoke**:

| | |
|---|---|
| 🟢 green | contact within 30 days |
| 🔴 red | 30+ days |
| ⚪ grey | nothing logged yet |
| ring | an **active contact** — someone you mean to stay close to |

**A red node wearing a ring is the whole point of the page.** Those are the
people you decided mattered and then went quiet on; they get a pulsing halo, a
strip at the top of the page, and the count on the hub tile ("4 · need
contact").

- **Drag** nodes, **scroll/pinch** to zoom, **drag the background** to pan.
  Hover or tap a node to light it and its neighbours and dim everyone else.
- **Logging contact is two taps from the graph**: tap the person, tap
  **Log contact**. It files today's date with whatever method you last used,
  and offers an undo. Everything else — back-dating, method, a note — is in the
  profile.
- **Profile panel** (a bottom sheet on a phone) holds every field, that
  person's connections, and their contact history, with "last contact: X days
  ago" pinned at the top.
- **Search** jumps to and focuses a person; **filters** narrow by group, tag,
  active contacts, or red-only. Searching for someone the filters are hiding
  clears the filters rather than doing nothing.
- **Export / Import JSON** (⋯ menu) covers all three keys, so the data isn't
  trapped in a browser. The same menu loads **sample data** and wipes it again.

The graph is a small hand-rolled force simulation on `<canvas>` — no d3, no
build step, nothing fetched at runtime. It holds 60fps at 150 people / 400
links, and **stops asking for frames once the layout settles**, so a graph
sitting open on a phone costs nothing.

### Storage (three keys, and one rule)

```
social_people_v1     social_links_v1     social_contacts_v1
```

One key per thing that changes independently: logging a contact on your phone
can't conflict with editing a profile on your laptop.

**`lastContactedAt` is never stored.** Recency is derived from the contact log
every time the graph draws. A page that recomputed it and wrote it back at load
would look, to the sync engine, exactly like an edit you'd just made — and being
newest it would win. That's the failure [SYNC.md](SYNC.md) exists to prevent, so
this page makes **no writes at all** until you do something. Links pointing at a
deleted person are skipped at render time rather than cleaned up on boot; the ⋯
menu offers a manual tidy (a `PatronDB.derive` write, which can never overwrite
another device).

## Quick start

**Just try it:** open `index.html` in a browser. A first-run prompt asks for your
name + basic stats, which personalize the suite and pre-fill the apps.

**Deploy it (recommended):**
1. Fork this repo.
2. Import it into [Vercel](https://vercel.com) (no build step — it's static + `/api` functions).
3. (Optional) set the env vars below, then open your deployed URL.

## How your data is stored

Everything lives in **your browser's `localStorage`** — there is no central database
and no account. Two consequences, stated plainly:

- **Private:** your data and API keys never leave your device (except calls you make
  directly to Finnhub / Anthropic / Whoop with your own credentials).
- **Per-browser, not synced:** a different device = different data, and clearing your
  browser data erases it. Treat it like a local app, not a cloud service.

Shared keys used across the suite: `patron_profile_v1` (your profile),
`patron_health_v1` (vitals — Whoop / Apple Watch / manual).

## Optional integrations

| Feature | Where | How |
|---|---|---|
| **Whoop** live recovery/sleep/strain | Hub vitals + `whoop.html` | Server-side OAuth — see [`WHOOP_SETUP.md`](WHOOP_SETUP.md). Needs Vercel + env vars. |
| **Apple Watch** | Hub vitals | No web API exists — enter your latest Health readings manually. |
| **Manual vitals** | Hub vitals | Type recovery + sleep; feeds the supplement recommender. |
| **Stock prices** (Finance) | Finance ⚙ settings | Paste a free [Finnhub](https://finnhub.io) key (stored in your browser). |
| **AI statement import** (Finance) | Finance ⚙ settings | Paste an [Anthropic](https://console.anthropic.com) key (Haiku, downscaled images — cheap). |
| **Gym sync** | Gym → ⚙ Settings → Cloud sync | Optional — paste *your own* Supabase URL + publishable key (else local-only). See below. |

### Environment variables (Vercel → Project → Settings → Environment Variables)

```
WHOOP_CLIENT_ID=         # only if you want live Whoop sync
WHOOP_CLIENT_SECRET=
```

See [`.env.example`](.env.example). Finnhub/Anthropic keys are entered in-app (not env vars).

### Gym cloud sync — use your own Supabase (optional)

Gym is local-only until you connect your own free Supabase project (nothing is shared
with anyone else). One-time setup:

1. Create a project at [supabase.com](https://supabase.com).
2. **Project → Settings → API:** copy the **Project URL** + the **publishable** key (`sb_publishable_…`).
3. **Project → SQL Editor:** run this once:
   ```sql
   create table if not exists public.app_state (
     key text primary key,
     data jsonb not null default '{}',
     updated_at timestamptz not null default now()
   );
   alter table public.app_state enable row level security;
   create policy "rw app_state" on public.app_state for all using (true) with check (true);
   alter publication supabase_realtime add table public.app_state;
   insert into storage.buckets (id, name, public) values ('progress-photos','progress-photos',true)
     on conflict (id) do nothing;
   create policy "rw photos" on storage.objects for all
     using (bucket_id='progress-photos') with check (bucket_id='progress-photos');
   ```
   (Permissive RLS is fine for a **single-user** personal project keyed to one row. Don't reuse this project for multiple people.)
4. In the app: **Gym → ⚙ Settings → Cloud sync**, paste the URL + key, **Save & sync**.

## Local vs deployed

- **Local (`file://`):** everything works *except* Whoop live sync (needs the `/api`
  functions). The Whoop tab falls back to manual entry / sample preview.
- **Deployed (Vercel):** the full thing, including Whoop OAuth.

## License

MIT — see [`LICENSE`](LICENSE). Fork it, deploy it, make it yours.

## Disclaimer

This is a personal-tracking tool, **not** medical, dietary, or financial advice.
Supplement doses and recommendations are general information — consult a professional.
You are responsible for any keys, credentials, and data you add.
