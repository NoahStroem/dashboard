# Add the Peak Tracker to your dashboard

Peak is a **self-contained, drop-in page**. It works on any fork of the dashboard,
reads/writes the standard localStorage keys, and cloud-syncs automatically if
`db.js` is present (and still works fine without it). Two files + one card line.

---

## 1. Copy these files into your repo
- **`peak.html`** — the Peak Tracker (energy curve, score, caffeine, water, supplements, feel slider)
- **`meds.html`** — the dedicated Meds & substances tracker (Peak links to it)

That's it for the pages. They share data with your existing trackers
(`stimulant_standalone_v1`, `water_standalone_v1`, `supplements_standalone_v1`,
`patron_health_v1`, `peak_meds_v1`, `peak_feel_v1`, `peak_log_v1`) — and degrade
gracefully if a tracker isn't there yet.

## 2. Add the cards to `index.html`

In the **`APPS`** array (near the top of the dashboard script), add:
```js
{ file: 'peak.html', name: 'Peak', tag: 'Daily readiness · energy curve', icon: '🔆', wide: true },
{ file: 'meds.html', name: 'Meds', tag: 'Doses · peak & comedown timing', icon: '💊' },
```

In the **`ART`** map (the per-card gradient), add:
```js
'peak.html':'linear-gradient(135deg,#34D399,#22D3EE)',
'meds.html':'linear-gradient(135deg,#34D399,#22D3EE)',
```

## 3. (Optional) animated card icons
For the glowing 3D card icons, copy the `'peak.html'` and `'meds.html'` entries
from **`icons.js`** into your own `icons.js`. Skip this and the cards still work —
they'll just use the emoji.

---

## That's it
Open the dashboard → tap **Peak**. With **Manual** selected you can rate your
morning, log caffeine/meds/water/supplements, and watch your hour-by-hour energy
curve build — no wearable required. Connect Whoop or an Apple-Watch shortcut and
it uses real recovery data instead.

**Prompt version:** if you'd rather have Claude Code build it from scratch on your
fork, the full copy-paste prompt is in `PATREON-EP-3.md`.
