# Add the AI Mentor (Nova) to your dashboard

`mentor.html` is a "Nova" AI Mentor page — a 3D avatar, a chat box, and a cozy
"thinking" loader. This guide turns it into a **general mentor** that can answer
about **any** part of your dashboard (finance, gym, food, sleep, goals, …) using
your real data, with your Anthropic API key kept safely on the server.

## How it works
- **`api/mentor.js`** — a serverless function holds your Anthropic key in an
  environment variable and forwards chat requests to Anthropic. The key never
  reaches the browser.
- **`db.js`** — the same whole-device sync every page uses. Loading it in
  `mentor.html` pulls your full dashboard (across all devices) into localStorage,
  so the mentor can see everything.
- **`mentor.html`** — reads all of localStorage and sends it to Claude as
  context, then shows the reply. No design changes — only the reply source and
  the loader text.

## The prompt (paste into Claude Code / Cursor in VS Code)

```
You are setting up the AI Mentor page (mentor.html) in a multi-page life-tracking
dashboard. The dashboard's apps (finance, gym, food, water, sleep, goals,
supplements, etc.) each save their data to the browser's localStorage, and a
shared script db.js syncs the WHOLE device's localStorage to/from Supabase so the
data follows the user across devices. The mentor must be a GENERAL mentor that
can answer about ANY part of the dashboard using ALL of the user's data, with the
Anthropic API key kept server-side. Do everything below.

==================================================================
PART 1 — SERVER-SIDE KEY (never put the key in the browser)
==================================================================
Create api/mentor.js — a serverless proxy that adds the secret key from an
environment variable and forwards the request to Anthropic. Match the project's
existing api/ style (CommonJS module.exports):

    module.exports = async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"POST only"}'); return; }
      const key = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!key) { res.statusCode = 500; res.end('{"error":"ANTHROPIC_API_KEY is not set"}'); return; }
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        res.statusCode = r.status; res.end(JSON.stringify(await r.json()));
      } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
    };

Create a real .env file in the project root with this exact content:
    ANTHROPIC_API_KEY=sk-ant-paste-your-key-here
Create .env.example with the same line (committed template). Ensure .env (not
.env.example) is in .gitignore so the real key is never pushed. After editing,
print a note telling me to open .env and paste my real Anthropic key.

==================================================================
PART 2 — MAKE THE MENTOR SEE THE WHOLE DASHBOARD
==================================================================
Open another page that already syncs (e.g. index.html) and copy its two sync
script tags from just before </body> — they look like:
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="db.js?v=15"></script>   <!-- use the SAME ?v=NN as the other pages -->
Add those SAME two tags to mentor.html just before its closing </body> tag,
after the existing scripts. This makes the mentor pull the user's whole-device
snapshot (finance, gym, food, sleep, goals — including data entered on other
devices) into localStorage before it answers. localStorage IS the full dashboard
once db.js has synced.

==================================================================
PART 3 — GENERAL MENTOR REPLIES (remove any hardcoded canned answers)
==================================================================
In mentor.html, remove any hardcoded reply arrays / keyword matchers (e.g.
REPLIES, FALLBACK, pickReply) and any topic-specific cozy-loader lines. Do NOT
change any design, CSS, the 3D avatar, animations, the chat bubbles, or the cozy
loader visuals. Only change where the reply text comes from and the loader text.

Add a reader that gathers the whole synced dashboard:
    function readDashboardData() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === 'patron_theme') continue;          // skip UI-only keys
        try { out[k] = JSON.parse(localStorage.getItem(k)); }
        catch { out[k] = localStorage.getItem(k); }
      }
      return out;
    }

Add the real reply call (key stays server-side via Part 1):
    async function askNova(userText) {
      const data = readDashboardData();
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          system:
            "You are Nova, the user's personal mentor living inside their " +
            "life-tracking dashboard. You can see ALL of their data (finance, " +
            "gym, food, water, sleep, readiness, goals, supplements — whatever " +
            "is present). Answer about ANY area of their life, grounded in their " +
            "real numbers. Be honest, specific, and encouraging, and always give " +
            "ONE concrete thing to act on. Keep replies short. Current dashboard " +
            "data as JSON:\n" + JSON.stringify(data),
          messages: [{ role: 'user', content: userText }],
        }),
      });
      const json = await res.json();
      if (json.error || !json.content) return "Hmm, I couldn't reach my brain just now — check that the API key is set.";
      return json.content[0].text;
    }

Wire the page so that when the user sends a message: show the existing cozy
loader + Nova's thinking face, then `await askNova(text)`, then render the
returned text in the SAME coach bubble (keep the Nova tag chip and the fade
reveal), escaping it as plain text, and keep Nova's facial reactions.

Set the cozy-loader sayings to general mentor lines (same format):
    const CZ_TAGS = ['Thinking', 'One sec', 'On it'];
    const CZ_LINES = [
      { text: 'Reading your whole day across the dashboard.', hl: 'whole day' },
      { text: 'Finding the one move that matters most right now.', hl: 'one move' },
      { text: 'Keeping it honest and something you can do today.', hl: 'do today' },
    ];

==================================================================
CONSTRAINTS
==================================================================
- Do not change any design, CSS, the avatar engine, the layout, or the cozy
  loader look. Only the reply SOURCE and the loader TEXT change.
- The key must NEVER appear in mentor.html or any client-side file — only in the
  ANTHROPIC_API_KEY environment variable used by api/mentor.js.
```

## Where to put your Anthropic key
Get one at **console.anthropic.com → API Keys** (starts with `sk-ant-...`), then:

- **Local (VS Code):** open the new `.env` file and replace
  `sk-ant-paste-your-key-here` with your real key.
- **Live (Vercel):** Project → **Settings → Environment Variables** → add
  `ANTHROPIC_API_KEY` → redeploy. (The `.env` file only works on your own
  machine; Vercel needs its own copy.)

**Note:** the mentor only sees real data when it runs on the same deployment
where the data was entered (your live site), or when Supabase sync is configured.
On a bare `localhost` with no Supabase connection, it stays local-only.
