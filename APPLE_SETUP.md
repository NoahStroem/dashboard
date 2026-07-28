# Apple Watch / Apple Health — automatic sync

Apple won't let a website read Health data directly, so we use a free **Apple
Shortcut** that reads your Health numbers and sends them to your dashboard.
Set it up once → it runs every morning automatically → your vitals fill in.

You already have the receiving end: **`/api/apple`** (deployed with the app).
All that's left is the Shortcut on your iPhone.

---

## 1. (Optional but recommended) Add a secret token

So only your phone can write to your dashboard:

1. Vercel → your project → **Settings → Environment Variables**
2. Add `APPLE_SYNC_TOKEN` = any random text you make up (e.g. `r0wan-sync-9f2k`)
3. Redeploy.

You'll put this same value in the Shortcut's URL below. (Skip this and it still
works — just unprotected.)

---

## 2. Build the Shortcut (2 minutes)

On your iPhone: open the **Shortcuts** app → **+** (new shortcut) → add these
actions in order:

1. **Find Health Samples** — Type: *Heart Rate Variability*, Sorted by *End
   Date*, *Latest*, Limit **1**. → tap the result, "Get **Average** of Health
   Samples" → name the variable **HRV**.
2. **Find Health Samples** — Type: *Resting Heart Rate*, Latest, Limit 1 →
   Average → name it **RHR**.
3. *(Optional, sleep)* **Find Health Samples** — Type: *Sleep*, last night →
   total hours → name it **SLEEP**. (Sleep is fiddly in Shortcuts; you can skip
   it and still get HRV + resting HR.)
4. **Text** action — paste this, inserting your variables where shown:
   ```json
   {"hrv": HRV, "rhr": RHR, "sleepHours": SLEEP}
   ```
5. **Get Contents of URL**:
   - URL: `https://YOUR-APP.vercel.app/api/apple?token=YOUR_TOKEN`
     (use your real Vercel URL; drop `?token=…` if you skipped step 1)
   - Method: **POST**
   - Request Body: **JSON**  → set it to the **Text** from step 4
6. Name the shortcut **"Sync Health"** and save.

Tap it once to test — open your dashboard, your HRV + resting HR should appear
in **Today's vitals** (source: Apple Watch).

---

## 3. Make it automatic

Shortcuts app → **Automation** tab → **+** → **Time of Day** → pick a time
(e.g. 8:00 AM, after your watch has synced your sleep) → **Run "Sync Health"**
→ turn **OFF** "Ask Before Running".

Done — every morning your dashboard updates itself, no typing.

---

## Notes
- Apple has **no recovery score**, so the recovery ring stays blank (same as
  Fitbit). Sleep, HRV and resting HR fill in everything else.
- Whoop or Fitbit, if connected, take priority over Apple.
- The data lands in your own Supabase, then syncs to all your devices like
  everything else.
