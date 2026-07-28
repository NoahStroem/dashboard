// /api/sheet — read-only fetcher for a published Google Sheet (CSV).
//
//   GET /api/sheet?url=<published csv url>
//
// The dashboard tries to fetch the sheet straight from the browser first; this
// endpoint is the fallback for when Google doesn't send CORS headers for a
// given publish URL. It only ever performs a GET and only against Google's
// spreadsheet hosts, so it can't be used as an open proxy for arbitrary URLs.

const ALLOWED_HOSTS = ['docs.google.com', 'spreadsheets.google.com'];
const MAX_BYTES = 2 * 1024 * 1024; // a training program is kilobytes; cap the rest

module.exports = async (req, res) => {
  const target = (req.query && req.query.url) || '';
  if (!target) {
    res.status(400).json({ error: 'Missing ?url=' });
    return;
  }

  let parsed;
  try { parsed = new URL(target); }
  catch (e) { res.status(400).json({ error: 'Not a valid URL.' }); return; }

  if (parsed.protocol !== 'https:' || ALLOWED_HOSTS.indexOf(parsed.hostname) === -1) {
    res.status(400).json({ error: 'Only https Google Sheets publish URLs are allowed.' });
    return;
  }

  try {
    const r = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'patron-dashboard/1.0' }
    });
    if (!r.ok) {
      // 403 is nearly always one of two things: the sheet isn't link-shared, or
      // it's an .xlsx uploaded to Drive, which Google won't export as CSV.
      const hint = r.status === 403
        ? '403 — Google refused. Either the sheet isn’t shared as "anyone with the link", or it’s an uploaded Excel file, which needs File ▸ Save as Google Sheets first.'
        : r.status === 404
          ? '404 — that sheet or tab no longer exists. Check the gid, or re-publish the tab.'
          : 'Sheet responded ' + r.status + '. Is it still published to the web?';
      res.status(502).json({ error: hint });
      return;
    }
    const text = await r.text();
    if (text.length > MAX_BYTES) {
      res.status(413).json({ error: 'Sheet is too large (over 2 MB).' });
      return;
    }
    // Google serves the sign-in page as HTML when a sheet isn't actually public.
    if (/^\s*<(!doctype|html)/i.test(text)) {
      res.status(502).json({ error: 'Got a web page instead of CSV — re-check File ▸ Share ▸ Publish to web, and that the format is CSV.' });
      return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the sheet.' });
  }
};
