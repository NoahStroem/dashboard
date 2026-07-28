// GET /api/config — serves this deploy's PUBLIC Supabase config to the browser.
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
module.exports = (req, res) => {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  res.setHeader('content-type', 'application/json');
  // Cache briefly at the edge; config rarely changes.
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  res.statusCode = 200;
  res.end(JSON.stringify({ url, key }));
};
