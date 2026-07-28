// GET /api/youtube?handle=<@handle | channelId | channel URL>
//
// The official YouTube Data API v3 (channels.list + statistics). Unlike TikTok
// this is a real API: it needs YOUTUBE_API_KEY set on the host (one key, set once
// by the deployer — NOT per user). No login: public channel stats are key-readable.
// Returns subscriberCount (rounded by YouTube to 3 sig-figs), viewCount, videoCount.

const ENV_KEY = process.env.YOUTUBE_API_KEY;
const BASE = 'https://www.googleapis.com/youtube/v3';

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');

  const params = new URL(req.url, 'http://x').searchParams;
  // Key priority: per-user key passed from the app (each forker uses their own),
  // falling back to a host-wide YOUTUBE_API_KEY env var if the deployer set one.
  const KEY = (params.get('key') || '').trim() || ENV_KEY;
  if (!KEY) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'not_configured' })); return; }

  let handle = (params.get('handle') || '').trim();
  if (!handle) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'no_handle' })); return; }
  const um = handle.match(/youtube\.com\/(?:channel\/([\w-]+)|(@[\w.-]+))/i); // accept a full URL
  if (um) handle = um[1] || um[2];

  try {
    // Channel IDs start with UC…; otherwise treat as an @handle.
    const isId = /^UC[\w-]{20,}$/.test(handle);
    const q = isId
      ? '?part=statistics,snippet&id=' + encodeURIComponent(handle)
      : '?part=statistics,snippet&forHandle=' + encodeURIComponent(handle.replace(/^@/, ''));
    let j = await (await fetch(BASE + '/channels' + q + '&key=' + KEY)).json();
    let item = j && j.items && j.items[0];

    // Fallback: forHandle can miss legacy custom URLs — search, then re-fetch by id.
    if (!item) {
      const sj = await (await fetch(BASE + '/search?part=snippet&type=channel&maxResults=1&q=' + encodeURIComponent(handle.replace(/^@/, '')) + '&key=' + KEY)).json();
      const cid = sj && sj.items && sj.items[0] && sj.items[0].id && sj.items[0].id.channelId;
      if (cid) { const j2 = await (await fetch(BASE + '/channels?part=statistics,snippet&id=' + cid + '&key=' + KEY)).json(); item = j2 && j2.items && j2.items[0]; }
    }
    if (!item) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'not_found' })); return; }

    const st = item.statistics || {}, sn = item.snippet || {};
    const num = (x) => x != null ? Number(x) : null;
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true, platform: 'youtube',
      handle: sn.customUrl ? ('@' + String(sn.customUrl).replace(/^@/, '')) : handle,
      nickname: sn.title || null,
      followers: num(st.subscriberCount),
      lifetimeViews: num(st.viewCount),
      videoCount: num(st.videoCount),
      avatarUrl: (sn.thumbnails && sn.thumbnails.default && sn.thumbnails.default.url) || null,
      ts: Date.now(),
    }));
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'fetch_failed' }));
  }
};
