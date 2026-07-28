# Connecting Fitbit (real auto-sync)

The dashboard's **Today's vitals → Fitbit → Connect Fitbit** button uses Fitbit's
official OAuth 2.0 Web API. The flow runs through small serverless functions in
[`/api/fitbit`](api/fitbit) so your Fitbit **client secret never touches the browser**.

This only works on a deployed host that runs serverless functions (e.g. **Vercel**).
Opened as a local file, the dashboard falls back to **Apple Watch / Manual** entry.

> **Which app type do I pick?** When you register the Fitbit app it asks for an
> *OAuth 2.0 Application Type*:
> - **Personal** — simplest. Choose this if **only you** will connect your own Fitbit.
> - **Server** — choose this if **several different people** will connect their Fitbits
>   to the *same* deployment.
>
> The keys are **per deployment, not per user** — set once by whoever deploys. End
> users never enter keys; they just click **Connect Fitbit** and log into their own
> Fitbit account.

## One-time setup

1. **Register a Fitbit app** at <https://dev.fitbit.com/apps/new>.
2. Set:
   - **OAuth 2.0 Application Type:** `Personal` (just you) or `Server` (multiple users) — see the note above. Both issue a client secret, which is all this integration needs.
   - **Callback URL** — match your deployment exactly:
     - Production: `https://YOUR-APP.vercel.app/api/fitbit/callback`
     - Local (`vercel dev`): `http://localhost:3000/api/fitbit/callback`
3. Note the **OAuth 2.0 Client ID** and **Client Secret**.
4. The app requests scopes: `sleep`, `heartrate`, `profile`.
5. In **Vercel → Project → Settings → Environment Variables**, set:
   - `FITBIT_CLIENT_ID`
   - `FITBIT_CLIENT_SECRET`

   (See [`.env.example`](.env.example). For local dev, put the same in a `.env`.)
6. Redeploy. Open the dashboard → **Today's vitals → Fitbit → Connect Fitbit**.

## How it works

| Endpoint | Purpose |
|---|---|
| `GET /api/fitbit/login` | Redirects to Fitbit's login/consent screen (with a CSRF `state`). |
| `GET /api/fitbit/callback` | Exchanges the code for tokens; stores the **refresh token** in an httpOnly cookie. |
| `GET /api/fitbit/data` | Refreshes the access token (rotating the refresh token), fetches latest sleep / resting HR / HRV, returns vitals. |
| `GET /api/fitbit/logout` | Forgets the stored token (disconnect). |

The returned vitals (HRV, resting HR, sleep hours, sleep efficiency, **bedtime &
wake time**) are written to the suite-wide `patron_health_v1` record, so the
Supplements recommender and the Goals **day-window / estimated-bedtime** feature
pick them up automatically — same as manual or Apple Watch entry, just live.

## What Fitbit does and doesn't give

- ✅ **Sleep** — hours asleep, efficiency, and start/end times (→ bedtime & wake time).
- ✅ **Resting heart rate** and **HRV** (daily RMSSD).
- ❌ **Recovery score** — Fitbit has no universal equivalent to WHOOP's recovery
  (its "Daily Readiness" is Premium-only and not exposed reliably), so the recovery
  ring stays blank for Fitbit users. Everything else fills in.

> A forker without Fitbit env vars set just sees the **Apple Watch / Manual** options;
> nothing breaks.
