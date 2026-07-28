# Adding a new screen (card) to the dashboard

Every page is a self-contained HTML file in the new **cyberpunk** style
(dark OLED, neon purple/cyan, Orbitron/Exo 2). `_template.html` is already
set up that way, so a new screen matches the rest without copying CSS.

## The fast way (just ask Claude Code)

In VS Code, type:

> Add a new **[X]** card to my dashboard. Use `_template.html` as the base for
> the new page, give it a matching neon icon + gradient, add it to the dashboard
> grid, keep the design, and push it.

Claude does all 4 steps below for you. Or do them by hand:

## The 4 steps by hand

1. **Copy the template**
   ```
   cp _template.html sleep.html        # use your own page name
   ```

2. **Edit the marked spots** in your new file (search the numbered comments):
   - `1.` the `<title>`
   - `2.` the `<h1 class="title">` + `<p class="subtitle">`
   - `3.` the page body — build with the shared classes (`.card`, `.btn`,
     `.btn-primary`, `.btn-ghost`, `.input`, …). Save data under a unique
     localStorage key, e.g. `sleep_standalone_v1`.

3. **Add it to the dashboard grid.** Open `index.html`, find the `APPS` array
   (top of the `<script>`) and add one line:
   ```js
   { file: 'sleep.html', name: 'Sleep', tag: 'Sleep tracking', icon: '😴' },
   ```
   Add `wide: true` to make the card span two columns.

4. **Give it a color + animated icon** (so the card matches):
   - **Gradient** — in `index.html`, add to the `ART` map:
     ```js
     'sleep.html':'linear-gradient(135deg,#8B5CF6,#22D3EE)',
     ```
   - **Animated icon** — in `icons.js`, add a `'sleep.html': \`<svg…>\``
     entry (copy any existing icon block and swap the paths). Cards pull
     their icon from `icons.js` automatically via `iconSvg(file)`.

That's it — the new page already has the neon theme, fonts, the
back-to-dashboard link, and `brand.js` (so it shows the current user's name).

## Show a live stat on the card (optional)
The card can show a number instead of its tagline. In `index.html`, add a
case to `statFor()` that reads your page's localStorage key:
```js
else if (file === 'sleep.html') { const s = lsGet('sleep_standalone_v1');
  if (s && s.hours) return { value: s.hours + 'h', label: 'last night' }; }
```

## Push it live
```
git add -A && git commit -m "Add Sleep page" && git push origin main
```
Vercel redeploys automatically (~1 min).
