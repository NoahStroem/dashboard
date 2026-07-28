# Patreon · Episode 4 — Nova, Your AI Mentor

The full copy-paste prompt to add a 3D AI mentor + animation kit to your fork of
the dashboard. Paste it into Claude Code (in the dashboard repo) and let it build
+ push.

---

## 🪐 Build the AI Mentor (copy-paste this whole block)

```
Build a new "AI Mentor" page (ai-mentor.html) for my dashboard and add it as a
wide card on index.html (cyan→violet gradient, 🪐 icon) that links to it. Style it
dark and cosmic with an elegant serif headline and mono labels to match my
dashboard.

NOVA AVATAR (hero): a 3D AI companion called Nova using Three.js — an iridescent
glass octahedron floating in dark cosmic space. It slowly rotates and "breathes",
follows the cursor, blinks, and shows emotions on a glowing face. No rings, just
the crystal, a soft inner glow, and a halo of drifting particles. Light it cyan →
violet → pink. A serif italic "Nova" name label with a "your ai mentor" role
underneath. Expose a small JS API so the page can change its expression.

PALETTES: a row of swatches above Nova that recolor the avatar live.

TABS (sticky bar with a "← Dashboard" link):
- Mentor — the Nova avatar + a click-to-copy animation gallery (15 pure-CSS
  animations; click any tile to copy its self-contained CSS to the clipboard).
- Chat Box Lab — copy-paste chat UI snippets.
- Cozy Loader — copy-paste loading animations.
Plus an "▶ Auto-tour" button that plays each animation on Nova in sequence with a
caption, and a "⬇ Copy everything" button that grabs the whole kit.

Everything is self-contained — each snippet copies clean so I can paste it into any
other page. Syntax-check the inline script, then commit and push.
```

---

## How it works (for the video)

- **Nova** → a real-time 3D avatar (Three.js) that breathes, blinks, follows your
  cursor, and emotes — your dashboard's face
- **The kit** → 15 click-to-copy CSS animations, chat-box snippets, and cozy
  loaders you can drop into any page
- **Auto-tour** → press play and Nova demos every animation on herself
- **One card** → lives on the dashboard as the "AI Mentor" tile, opens straight to
  the Mentor tab
