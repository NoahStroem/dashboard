// GET /api/whoop/callback — WHOOP redirects here with ?code & ?state.
// Verifies state, exchanges the code for tokens (server-side, with the secret),
// stores the refresh token in an httpOnly cookie, and returns to the dashboard.
const L = require('./_lib');

module.exports = async (req, res) => {
  const origin = L.getOrigin(req);
  const url = new URL(req.url, origin);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthErr = url.searchParams.get('error');
  const cookies = L.parseCookies(req);
  const secure = L.isHttps(req);
  const back = (status) => { res.statusCode = 302; res.setHeader('Location', '/?whoop=' + status); res.end(); };

  if (oauthErr) return back('denied');
  if (!code || !state || state !== cookies.whoop_state) return back('error');

  let id, secret;
  try { ({ id, secret } = L.creds()); }
  catch (e) { res.statusCode = 500; res.end('WHOOP not configured'); return; }

  try {
    const tok = await L.tokenRequest({
      grant_type: 'authorization_code',
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: L.redirectUri(req),
    });
    const out = [L.clearCookie('whoop_state', secure)];
    if (tok.refresh_token) out.push(L.cookie('whoop_refresh', tok.refresh_token, { maxAge: 60 * 60 * 24 * 365, secure }));
    res.setHeader('Set-Cookie', out);
    return back(tok.refresh_token ? 'connected' : 'error');
  } catch (e) {
    return back('error');
  }
};
