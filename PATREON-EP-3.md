# Patreon · Episode 3 — The Peak Tracker

The full copy-paste prompt to build the Peak Tracker on your fork of the dashboard.
Paste it into Claude Code (in the dashboard repo) and let it build + push.

---

## 🔆 Build the Peak Tracker (copy-paste this whole block)

```
Build a new "Peak Tracker" page (peak.html) for my dashboard and add it as the
first card on index.html. It's one place for all my vitals that turns them into a
daily score + an hour-by-hour energy curve. Style it dark and minimal with an
elegant serif headline and mono labels (or match my dashboard's design).

SOURCE SWITCH (top): Manual / Whoop / Apple Watch. Reads the shared health record
(patron_health_v1). Whoop/Apple fetch from /api/whoop/data and /api/apple; if a
live refresh fails but cached data exists, keep showing it (never auto-redirect to
a login). Manual shows an inline "Daily check-in" card.

DAILY CHECK-IN (Manual): tap-only, no typing. A row of day-cards (last 7 days with
weekday/date + a colored readiness score; tap to view/back-fill any day). 1-tap
1–5 rating chips for Sleep quality, Energy, Mood, Soreness, Stress. For sleep, tap
a "woke at" time chip + an "hours slept" chip and DERIVE bedtime automatically.
Carry wake/hours over from the last entry. Save to a per-day log; today also
publishes to patron_health_v1.

OVERALL SCORE (ring): Recovery 45% + Sleep 30% always; Water, Protein (macros),
Supplements, and Gym are OPTIONAL — only blended on days they're logged (read
water/macros/supplements/gym from their own localStorage), renormalized, no
penalty for skipping. Recovery, when the source has none, = HRV 50% + resting HR
25% + sleep 25%. A "Why this score" toggle shows the full breakdown.

ENERGY CURVE: physiologically-grounded circadian arousal (sleep inertia after
waking → daytime plateau → a SHALLOW post-lunch dip ~45% through the waking day →
evening second-wind → wind-down → low overnight, lowest mid-sleep), anchored to my
wake/bed times, scaled by my recovery. PLUS pharmacokinetics for caffeine AND any
med/substance I log (each with onset→peak→wear-off and a rebound CRASH below
baseline as it clears). Render as a smooth area chart with hover/drag to scrub
(tooltip + a peak ring that updates), an x-axis 12A–12A, and LINE/BARS/STACK views.
Find and label the day's peak hour.

FEEL SLIDER: a small "how do you feel right now?" bar that PULLS the score toward
how I feel (pull starts 30%, grows to 50% over 30 days as my check-ins prove
reliable) AND logs feel-vs-prediction to calibrate the curve gradually. Show
"building a more detailed analysis · X/30 days".

CAFFEINE CARD: leads with mg consumed today + a ceiling progress bar (FDA-safe,
scaled to my weight). Stats: cut-off time (clears before bed), out-of-system time,
ideal dose (~3mg/kg). A search bar over a 40+ drink DB + add customs + most-used
quick chips (each shows projected energy lift). A today's-intake list with × to
delete and clear-all. Coaching that warns at ceiling / past cut-off and projects a
dose's effect. Log to the shared Stimulant tracker (stimulant_standalone_v1).

MEDS & SUBSTANCES CARD: a search bar for ANY prescription/nicotine/nootropic
(Concerta, Adderall, Vyvanse, Ritalin, modafinil, Zyn/Velo, L-tyrosine…) + add
customs, each with its own onset→peak→wear-off PK profile that shapes the curve
with a comedown. Daily quick-log, most-used chips, delete/clear, and a timeline
tip ("peaks ~X, fades ~Y"). KEEP MEDS INFORMATIONAL ONLY — never suggest changing
a dose. Store in peak_meds_v1.

HONESTY: an always-visible footer + a tappable "i" panel stating it's a
science-based ESTIMATE from my own data (not a medical measurement) that
personalizes over ~30 days, listing real inputs vs the model.

Everything cloud-syncs via the existing db.js (PatronDB.get/set). Syntax-check the
inline script, then commit and push.
```

---

## How it works (for the video)

- **Real inputs** → your Whoop / Apple Watch / manual vitals, caffeine, meds, supplements, weight/age/sex
- **The model** → circadian two-process rhythm × your recovery + caffeine & med pharmacokinetics (onset, peak, comedown)
- **Learns you** → your "how I feel" slider calibrates the curve over ~30 days
- **Honest** → it's a science-based estimate, not a medical device. Meds are informational only — never dosing advice.
