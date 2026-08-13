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
back-to-dashboard link, `brand.js` (so it shows the current user's name), and
**cross-device sync**.

## Sync comes for free — don't drop the scripts

`_template.html` carries one line in `<head>`:

```html
<script src="sync-boot.js?v=1"></script>
```

and four at the end of the page:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="sync-merge.js?v=1"></script>
<script src="sync.js?v=1"></script>
<script src="sync-ui.js?v=1"></script>
```

**Anything you save under a normal `localStorage` key syncs automatically** —
you write no sync code. Key by key, so two devices editing different pages both
keep their work, and two devices editing the *same* key get merged rather than
one of them losing. Deleting a key deletes it on your other devices too.

`sync-boot.js` must stay first in `<head>`: it has to see storage before your
page touches it. `sync-ui.js` adds the status pill. Full architecture:
[SYNC.md](SYNC.md).

If you drop these lines the page still *works*, but nothing it saves reaches
your other devices.

Use one `localStorage` key per thing that can change independently. A page that
crams everything into one giant key turns every edit into a whole-page conflict.

One deliberate exception, already handled in `sync.js`: `peak_schedule_v1`
(regenerated from the file).

### Don't rewrite storage while the page boots

This one has already cost real data. A page that *changes* `localStorage` as it
loads — rolling a tile over to a new day, clearing something stale, seeding
defaults — does it long before the first server round-trip comes back. It looks
like an edit you just made, and being newest it wins: open the dashboard on a
laptop that has been closed for two days and its start-up rewrite overwrites what
your phone saved.

So: **decide at render time what's stale, don't delete it at load time.** Storage
holds the last thing that was actually saved; the UI decides what to show. See
`freshOrArchive()` in `index.html` — the vitals tile treats yesterday's record as
empty but leaves it on disk.

If a page genuinely must rewrite its own storage, say so:

```js
PatronDB.write(key, value)    // a real edit you made
PatronDB.derive(key, value)   // the page tidying up after itself —
                              // can never overwrite another device
PatronDB.remove(key)          // a real deletion
```

`sync-boot.js` backstops this anyway (writes before the first pull can't win, and
start-up *deletions* are discarded outright) — but that's a safety net, not
permission.

### Re-render instead of reloading

Register a handler and the page updates in place when another device changes
something. Without one the engine falls back to reloading the page.

```js
PatronDB.onChange(function(){ state = load(); render(); });
```

### Getting data back after a bad overwrite

If one device still holds data the server has lost, open any page there with
`?rescue=1` (e.g. `index.html?rescue=1`). Automatic sync is off for that load, so
nothing is pulled down over it — then open the status pill → Advanced →
**Push this device up**, and reload your other devices.

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
