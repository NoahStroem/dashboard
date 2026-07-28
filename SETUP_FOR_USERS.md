# Make this app yours (for forkers)

You forked this app and deployed it on Vercel. Here's how to put **your** name on it and turn on live YouTube counts. Two parts: a one-time name change (uses Claude), and the YouTube key (done right in the app — no code).

---

## 1. Rename the app to your name (Claude Code in VS Code)

Open the project in VS Code, open Claude Code, and paste this prompt — **replace `YOUR NAME` with your actual name** first:

```
Rebrand this app's display name to "YOUR NAME".

- Replace every user-facing occurrence of the current brand name with "YOUR NAME"
  across all .html, .js, .css, .json, .webmanifest and .md files (page titles,
  the dashboard header, the "← back" links, the live tickers — everything visible).
- Don't touch the nested duplicate folder if one exists; only edit the tracked
  top-level files.
- When done, commit the change and push it to the `main` branch so Vercel
  redeploys automatically.
```

Give it ~1 minute after it pushes, then hard-refresh your live site (Cmd/Ctrl+Shift+R). Your name will show everywhere.

> If Claude says it can't push to `main`, run this yourself in the VS Code terminal:
> `git add -A && git commit -m "Rebrand to YOUR NAME" && git push origin main`

---

## 2. Turn on live YouTube subscriber counts (no code — done in the app)

Each person uses their **own** free YouTube API key. It's stored only in your browser, never uploaded or committed.

**Get a free key (2 minutes):**
1. Go to **https://console.cloud.google.com**
2. Create a project (any name).
3. Search for **"YouTube Data API v3"** → click **Enable**.
4. Left menu → **Credentials** → **Create Credentials** → **API key**.
5. Copy the key (starts with `AIza…`).

**Add it in the app:**
1. Open the **Creator** page.
2. In the **Accounts** section, tap **Edit** (or **+ Add account**).
3. Paste your key into **"YouTube API key"** and tap **Save key**.
4. Add a YouTube account with your @handle, then tap the **↻** button to pull live subscriber/view counts.

That's it. TikTok counts work automatically (no key). Other platforms: just type the numbers in Edit mode — growth charts build over time.

---

## Changing other things later

Anything else you want changed, open Claude Code in VS Code and just describe it
("change the accent color to green", "add a Twitch account option", etc.).
Claude edits the files and pushes to `main`; Vercel redeploys in about a minute.
