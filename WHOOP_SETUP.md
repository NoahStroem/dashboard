# Connecting WHOOP (real auto-sync)

The dashboard's **Today's vitals → Whoop → Connect Whoop** button uses WHOOP's
official OAuth API. The flow runs through small serverless functions in
[`/api/whoop`](api/whoop) so your WHOOP **client secret never touches the browser**.

This only works on a deployed host that runs serverless functions (e.g. **Vercel**).
Opened as a local file, the dashboard falls back to **Apple Watch / Manual** entry.

## One-time setup

1. **Create a WHOOP app** at <https://developer.whoop.com> → Developer Dashboard → *Create app*.
2. Note the **Client ID** and **Client Secret**.
3. Add a **Redirect URL** to the app, matching your deployment exactly:
   - Production: `https://YOUR-APP.vercel.app/api/whoop/callback`
   - Local (`vercel dev`): `http://localhost:3000/api/whoop/callback`
4. Request scopes: `read:recovery`, `read:sleep`, `read:cycles`, `read:profile`, `offline`.
5. In **Vercel → Project → Settings → Environment Variables**, set:
   - `WHOOP_CLIENT_ID`
   - `WHOOP_CLIENT_SECRET`

   (See [`.env.example`](.env.example). For local dev, put the same in a `.env`.)
6. Redeploy. Open the dashboard → **Today's vitals → Whoop → Connect Whoop**.

## How it works

| Endpoint | Purpose |
|---|---|
| `GET /api/whoop/login` | Redirects to WHOOP's login/consent screen (with a CSRF `state`). |
| `GET /api/whoop/callback` | Exchanges the code for tokens; stores the **refresh token** in an httpOnly cookie. |
| `GET /api/whoop/data` | Refreshes the access token (rotating the refresh token), fetches latest recovery/sleep/cycle, returns vitals. |
| `GET /api/whoop/logout` | Forgets the stored token (disconnect). |

The returned vitals (recovery, HRV, resting HR, sleep, strain) are written to the
suite-wide `patron_health_v1` record, so the Supplements recommender picks them up
automatically — same as manual or Apple Watch entry, just live.

> A forker without WHOOP env vars set just sees the **Apple Watch / Manual** options;
> nothing breaks.
