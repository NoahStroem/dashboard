// POST /api/mentor — server-side proxy to the Anthropic Messages API.
//
// The browser (mentor.html) posts a Messages API body here; this function adds
// the secret API key from a Vercel environment variable and forwards it to
// Anthropic. The key is NEVER sent to the browser or committed to GitHub.
//
// Set this in Vercel → Project → Settings → Environment Variables (and in a
// local .env file for `vercel dev`):
//   ANTHROPIC_API_KEY = sk-ant-...
module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return; }

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) { res.statusCode = 500; res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' })); return; }

  // Vercel auto-parses JSON bodies; fall back to manual parse just in case.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.statusCode = r.status;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Failed to reach Anthropic: ' + e.message }));
  }
};
