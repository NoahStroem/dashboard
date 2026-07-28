# The seed

One prompt builds your dashboard, your vault, and your mentor.

An empty board with your name on it. No tiles. That is on purpose. Every tile
from here is yours, added one at a time, with one line.

---

## Start

Make an empty folder, open Claude Code in it, and paste this:

```
Set up my board in this empty folder. My mentor is being made - for now, just
follow the setup, one step at a time, and tell me exactly where to click. I
might be a total beginner. Warm, straightforward, zero fluff.

1) npx --yes degit rowanthistlebrooke/seed . --force
   This hands you CLAUDE.md, your instructions. Read it first.

2) There is nothing to install - the board is plain files. Serve it with
   npx --yes serve . and hand me the localhost link. While that starts, put the
   wait to work: open the free signup pages for GitHub, Supabase and Vercel and
   tell me to make all three now. Free, and they are what take this live later.
   If I already have accounts, I use the ones I have.

3) Open it right here beside me in VS Code so I watch it live next to the chat.
   Walk me through Cmd/Ctrl+Shift+P, then "Simple Browser: Show", paste the
   link, right click that tab, then "Split Right". Tell me what I am looking at:
   an empty board. Empty on purpose. Every tile from here is mine.

4) Ask my name, and write it into lib/site.js the moment I say it, so the
   greeting is mine. That is all you ask. No goals, no interview - this is the
   base, and the rest comes later.

5) Then get me live, one step at a time. GitHub, and you do all the git, my only
   job is one browser sign in. Supabase: make my free project and run
   supabase/sync.sql so my vault tables exist and are waiting - and be honest
   that the board runs on this device for now; the live sync comes in a later
   episode. Vercel: import my repo and deploy. Then my phone: open my live URL,
   Share, Add to Home Screen. Keep SETUP.md ticking as we go, and before each
   step tell me if it is optional and what it gives me. I decide how far to
   take it.

Stop there. No API keys, no automation, no connector, no goal setting. Those
come later. When the board is live with my name on it, say so plainly. That is
the end of setup.
```

---

## Already have a board? The update prompt

Your board never goes stale. Paste this any time - it looks at what you
have and brings every piece current, without touching your data:

```
Update my board to the latest, from wherever it is. Look at what I have -
don't ask me to know. Never touch my data: my name (lib/site.js), my
registry entries, my weights, my vault/ and my tile data stay exactly as
they are. Tell me what changed when you're done, then push.

1) Refresh the platform from github.com/rowanthistlebrooke/seed:
   index.html, lib/tiles/host.js and lib/tiles/library.js (fetch the raw
   files, replace mine). If lib/site.js or lib/tiles/registry.js are missing,
   create them from the seed - never overwrite ones that exist. If my
   index.html has no <script src="lib/tiles/library.js">, add it after host.js
   so the Library gear loads.

2) Refresh every tile I have from its source, keeping my registry line:
   - finance -> github.com/rowanthistlebrooke/ep-finance-stocks (finance.html)
   - vitals  -> github.com/rowanthistlebrooke/inner-circle (vitals/vitals.html)
   A tile with no known source stays untouched.

3) If any of my tiles defines window.Vitality as a localStorage fallback
   with no postMessage bridge, swap in the shipped bridge and tell me
   what you fixed.

4) Sanity: serve it, confirm my name still greets me and every tile
   renders. Anything looks wrong, stop and show me before pushing.
```

---

## What is in here

```
index.html            your board. gem, your name, your date. nothing else yet
CLAUDE.md             the mentor's instructions. this is what makes it a mentor
lib/site.js           your name. one line, written the moment you say it
lib/tiles/registry.js the list of tiles on your board. one line per tile
lib/tiles/host.js     the host. renders each tile sealed, carries its data
lib/tiles/library.js  the Library: the settings gear, top right. every tile and what powers it
lib/tiles/weights.ts  the equation. y = Sum of w times x. empty until it is yours
vault/                your context. who you are, the chapter, the decisions
supabase/sync.sql     the vault schema. two tables, both yours only
tiles/                empty. this fills up one video at a time
SETUP.md              the checklist. it ticks as you go
```

## The vault

- **The ledger** is Supabase. Every log: a set, a sub, a stock, a franc. One
  table, one shape, so it can be read across everything at once.
- **The equation** is `lib/tiles/weights.ts`. Your goals, and what each tile is
  worth to them. Versioned in git, so it travels.
- **The context** is `vault/`. Plain markdown, in the repo. Not on one laptop.

## Adding a tile

Tiles arrive as one HTML file in a public repo. You paste one line:

```
Add the stocks tile from github.com/OWNER/REPO to my dashboard.
```

The mentor puts the file in `tiles/`, registers it, and adds it to your equation.
The tile saves straight into your vault. No command to learn.
