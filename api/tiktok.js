// GET /api/tiktok?handle=<username> — reads a PUBLIC TikTok profile.
//
// Honest about what this is: there is NO TikTok API key or login involved.
// It fetches https://www.tiktok.com/@handle server-side with a desktop-Chrome
// User-Agent (so TikTok's bot check doesn't block on sight), then pulls the
// profile JSON that TikTok embeds in the page (the __UNIVERSAL_DATA_FOR_REHYDRATION__
// script blob): followerCount, heartCount (lifetime likes), videoCount, avatar.
//
// It's a scrape, so it's brittle: if TikTok restructures their page the parse
// misses (→ parse_failed), and TikTok rate-limits / hard-blocks by IP (→ 429).
// Needs no per-user setup — works for everyone on the deployed host. Same-origin,
// so the browser calls it with no CORS.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cleanHandle(raw) {
  if (!raw) return '';
  let h = String(raw).trim();
  const m = h.match(/tiktok\.com\/@?([^/?#]+)/i); // accept a full profile URL
  if (m) h = m[1];
  return h.replace(/^@+/, '').trim();
}

// The rehydration JSON nests userInfo at a known path, but TikTok moves it
// around between layouts — so fall back to a recursive search for stats.followerCount.
function findUserInfo(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.userInfo && obj.userInfo.stats && obj.userInfo.stats.followerCount != null) return obj.userInfo;
  for (const k in obj) {
    const v = obj[k];
    if (v && typeof v === 'object') { const f = findUserInfo(v); if (f) return f; }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const handle = cleanHandle(new URL(req.url, 'http://x').searchParams.get('handle'));
  if (!handle) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'no_handle' })); return; }

  let html;
  try {
    const r = await fetch('https://www.tiktok.com/@' + encodeURIComponent(handle), {
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (r.status === 429) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'rate_limited' })); return; }
    if (!r.ok) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'not_found', status: r.status })); return; }
    html = await r.text();
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'fetch_failed' })); return;
  }

  let followers = null, hearts = null, videos = null, avatar = null, nickname = null;

  // Preferred: parse the embedded JSON blob.
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const scope = data && data.__DEFAULT_SCOPE__;
      let info = scope && scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo;
      if (!info || !info.stats) info = findUserInfo(data);
      if (info && info.stats) {
        followers = info.stats.followerCount;
        hearts = info.stats.heartCount != null ? info.stats.heartCount : info.stats.heart;
        videos = info.stats.videoCount;
      }
      if (info && info.user) {
        avatar = info.user.avatarLarger || info.user.avatarMedium || info.user.avatarThumb || null;
        nickname = info.user.nickname || null;
      }
    } catch (e) { /* fall through to regex */ }
  }

  // Fallback: regex-grep the raw HTML if the JSON shape changed.
  const grab = (re) => { const x = html.match(re); return x ? Number(x[1]) : null; };
  if (followers == null) followers = grab(/"followerCount":(\d+)/);
  if (hearts == null) hearts = grab(/"heartCount":(\d+)/);
  if (videos == null) videos = grab(/"videoCount":(\d+)/);
  if (!avatar) { const a = html.match(/"avatar(?:Larger|Medium|Thumb)":"([^"]+)"/); if (a) avatar = a[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/'); }

  if (followers == null) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: 'parse_failed', message: "Couldn't read the follower count. TikTok may have changed their page." }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true, platform: 'tiktok', handle: '@' + handle, nickname,
    followers, lifetimeViews: hearts, videoCount: videos, avatarUrl: avatar, ts: Date.now(),
  }));
};
