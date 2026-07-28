# RESUME HERE
- **Working on:** Peak tracker (peak.html) — energy curve + schedule + creator themes; standalone mirror.
- **Next step:** Nothing pending. Wait for the user's next feature request, then edit `peak.html` and regenerate `peak-standalone.html`.
- **Waiting on you:** nothing, keep going. (All work committed + pushed to origin/main.)

-----

## Done so far (all pushed, latest commit dfa2117 "after-midnight sleep zone fix")
- **Schedule:** every task requires an explicit time (no auto-add/gaps). Daytime parsing: `10-2`=10am–2pm, bare starts 1–5 roll to PM, `6-8` stays morning. Errors show in `schErr` banner.
- **Sleep:** sleep window drawn as dashed-bordered ZONE(s) on the graph via `sleepSegments()` (handles after-midnight bed = single `[bed,wake]` band). Hover zone → "Edit wake & sleep time" button → inline **stepper** popover (`−/+` 15-min, `sleepEditWake/Bed` state, `openSleepEdit()`/`saveSleepTimes()`). `planSleep()` uses YOUR chosen bedtime; `hasWakeBedData()` gates a CTA.
- **Themes/graph import:** Peak's "Import a creator theme" box (textarea) accepts both `PEAK-THEME:` (Schedule Lab: color+bg+cards+tasks) and Graph Lab JSON `{lab:'graph',...}` (color/line/glow/variant bars|stepped|dotted/`backdrop` aurora|stars|mountains|grid|dots). See `importThemeCode()`, `graphStyle()`, `chartBackdropHtml()`.
- **Labs:** `schedule-lab.html` has "🎨 Copy theme code" + Background picker. `graph-lab.html`/`text-lab.html` have per-card `copy` links. `DESIGN-LABS.md` documents the flow.
- **Standalone:** `peak-standalone.html` = `peak.html` with supabase+db.js stripped, brand.js inlined. Dashboard tile "PEAK · STANDALONE" in index.html. Verified pixel-matches live.

## Key files
- `peak.html` — the app. Build seed `SCHED_SEED` currently `lab-2026-06-07T-SCRIM`.
- `peak-standalone.html` — generated; DON'T hand-edit. Regenerate (see Watch out).
- `schedule-lab.html`, `graph-lab.html`, `text-lab.html` — design tools (export codes).
- `index.html` — dashboard tiles (APPS array ~line 333, gradients ~line 589).

## Watch out
- **Another session edits `peak-tracker.html` (a separate Peak variant) + sometimes `peak.html`/`graph-lab.html` and bumps SCHED_SEED.** Always `git fetch` + check seed before editing; only touch `peak.html`, never `peak-tracker.html`.
- **Regenerate standalone after every peak.html change** (run in repo root):
  `node -e 'const fs=require("fs");let h=fs.readFileSync("peak.html","utf8");const b=fs.readFileSync("brand.js","utf8");h=h.replace("<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>\n","").replace("<script src=\"db.js?v=15\"></script>\n","").replace("<script src=\"brand.js?v=16\"></script>","<script>\n"+b.trim()+"\n</script>");fs.writeFileSync("peak-standalone.html",h)'`
- **Testing:** dev server `python3 -m http.server 8731` (repo root). Verify with Playwright (installed at `/tmp/pwtest`, system Chrome `channel:'chrome'`). To reach the graph, seed `localStorage['patron_health_v1']` with `{source:'apple',connected:true,wakeTime:'07:00',bedtime:'22:45',sleepHours:7.5,sleepTargetHours:8,recovery:74,...}` (no health = daily check-in gate).
- `peak.html` script syntax check: `node -e '...new Function(block)...'` (used all session; 0 errors expected).
- Pushing to `main` deploys via Vercel (~1 min); HTML is `no-store` so hard-reload to see changes.
