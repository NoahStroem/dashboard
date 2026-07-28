# Connect your fitness band (Whoop · Fitbit · Apple Watch)

Your dashboard's **Today's vitals** tile can pull recovery, sleep, HRV and
resting heart rate from any of these. Pick whichever band you own — the app
already supports all three. Here's the quick version of each; full step-by-step
guides are linked.

| Band | How it connects | Recovery score? | Setup |
|------|-----------------|-----------------|-------|
| **Whoop** | One-tap OAuth login | ✅ Yes | API keys → Vercel |
| **Fitbit** | One-tap OAuth login | ❌ No | API keys → Vercel |
| **Apple Watch** | iPhone Shortcut (auto, daily) | ❌ No | No keys — just a Shortcut |
| **Manual** | Type it in | — | Nothing to set up |

---

## ⌚ Apple Watch (best for iPhone users)

Apple won't let a website read Health directly, so a free **Apple Shortcut**
reads your numbers and sends them to your dashboard automatically each morning.

1. *(Optional)* Add `APPLE_SYNC_TOKEN` env var in Vercel so only you can write.
2. Build a Shortcut that reads **HRV + Resting HR** (and optionally sleep) and
   **POSTs** them as JSON to:
   `https://YOUR-APP.vercel.app/api/apple?token=YOUR_TOKEN`
3. Add a **Time-of-Day automation** (e.g. 8 AM) so it runs itself.

➡️ Full step-by-step: **[APPLE_SETUP.md](APPLE_SETUP.md)**

No recovery score from Apple — sleep, HRV and resting HR fill in everything else.

---

## 🔋 Whoop

Recovery, sleep and strain sync automatically once connected.

1. Create a free app at **developer.whoop.com** → get your Client ID + Secret.
2. Add them in Vercel → Settings → Environment Variables:
   `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`
3. Set the redirect URL Whoop asks for to your deployed `/api/whoop/callback`.
4. Redeploy → open the app → **Connect Whoop** (one tap). Tokens stay
   server-side, never in the browser.

➡️ Full step-by-step: **[WHOOP_SETUP.md](WHOOP_SETUP.md)**

---

## 💠 Fitbit

Sleep, HRV, resting HR and your bed/wake times sync automatically.

1. Create an app at **dev.fitbit.com** → get your Client ID + Secret.
2. Add in Vercel: `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`
3. Set the callback URL to your `/api/fitbit/callback`.
4. Redeploy → **Connect Fitbit** (one tap).

➡️ Full step-by-step: **[FITBIT_SETUP.md](FITBIT_SETUP.md)**

Fitbit has no recovery score, so that ring stays blank — everything else fills in.

---

## ✍️ Manual (no band)

No setup at all. Open the dashboard → **Add vitals** → choose **Manual** (or
**Apple Watch** for a quick copy from the Health app) → type recovery, sleep,
HRV, resting HR. Your numbers then power the rest of the suite (the supplement
recommender reads recovery + sleep automatically).

---

### How it flows
Once any source is connected, the vitals publish across the whole suite and sync
to all your devices through your Supabase. Priority if more than one is set:
**Whoop → Fitbit → Apple → Manual.**
