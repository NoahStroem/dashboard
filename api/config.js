// GET /api/config — serves this deploy's PUBLIC client config to the browser.
//
// The values come from Vercel environment variables, NOT from the committed code,
// so the keys are never in the public GitHub repo. The anon key is public by
// design (safe to send to browsers); keeping it in an env var just stops it from
// being trivially searchable in source.
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL       = https://YOUR-PROJECT.supabase.co
//   SUPABASE_ANON_KEY  = eyJ... (anon public key)
//
// Forkers who don't set them get {url:'',key:''} and the app stays local-only
// until they add their own keys via the ☁ Cloud sync panel.
// Google Calendar sync adds one more public value here rather than a route of
// its own: this project is on Vercel's Hobby plan, which caps a deploy at 12
// serverless functions, and /api already defines 11. A second endpoint would
// spend the last slot to return one string.
//
//   GOOGLE_CLIENT_ID = 1234...apps.googleusercontent.com
//
// An OAuth client ID is public by design — it ships in the page source of every
// browser app that uses it. The client secret is NOT used by this integration
// and must never be added here.
//
// Note this function does not exist under `python3 -m http.server`, so on
// localhost the browser gets a 404 and falls back to a client ID pasted into
// the connect panel. See google-calendar.js → resolveClientId().
module.exports = (req, res) => {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  res.setHeader('content-type', 'application/json');
  // Cache briefly at the edge; config rarely changes.
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  res.statusCode = 200;
  res.end(JSON.stringify({ url, key, googleClientId }));
};
