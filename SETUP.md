# Setup — get your own copy running

Everything below is one-time. Most of the app works instantly; API keys are
optional and only needed for fitness-band sync.

## 1. Fork the repo
On the GitHub page, click **Fork** (top-right). This makes your own copy.

## 2. Deploy to Vercel
- Go to [vercel.com](https://vercel.com) and sign in with GitHub.
- Click **Add New → Project**, pick your forked repo, and click **Deploy**.
- Done — you get a live link like `https://your-app.vercel.app`.

At this point the whole dashboard already works: finance, water, gym,
supplements, goals, progress — all of it. Your data is saved in your browser.

## 3. (Optional) Fitness-band sync — Whoop / Fitbit
Only do this if you want the "Connect Whoop" or "Connect Fitbit" buttons to work.

In Vercel → **your Project → Settings → Environment Variables**, add the keys
for whichever you want:

```
WHOOP_CLIENT_ID
WHOOP_CLIENT_SECRET
FITBIT_CLIENT_ID
FITBIT_CLIENT_SECRET
```

Where to get them is written step-by-step in **`.env.example`** and
**`WHOOP_SETUP.md`** (both ship with the repo). After adding the keys,
hit **Redeploy** in Vercel.

## 4. (Optional) Creator follower auto-refresh
On the **Creator** page, the ↻ button auto-pulls follower counts:
- **TikTok** — works with **no key at all** (reads your public profile). Just type your handle.
- **YouTube** — add one optional key, then ↻ pulls subs/views. Get a free key at
  [Google Cloud Console](https://console.cloud.google.com) → enable **YouTube Data API v3**,
  then in Vercel → Settings → Environment Variables add `YOUTUBE_API_KEY` and Redeploy.
- **Instagram** — manual entry (its API needs per-user login).

> No Supabase, no database needed. Every API key above is optional — the dashboard works fully without them.

## 5. Install it on your phone (it's a real app)
Open your Vercel link on your phone:
- **iPhone:** Safari → Share → **Add to Home Screen**
- **Android:** Chrome → **Install app** prompt
It launches full-screen with its own icon — no browser bars.

---

## Want to add your own feature (e.g. a macros tracker)?
1. Install **Claude Code** (free): [claude.com/claude-code](https://claude.com/claude-code)
2. Open this project folder in Claude Code.
3. Type one sentence:

   > "Add a new page called macros.html using theme.css, and add it to the dashboard."

Claude builds it, matching the existing design automatically. Push the change
to GitHub and Vercel redeploys it for you.

Full details for builders: see **`HOW_TO_ADD_A_PAGE.md`**.
