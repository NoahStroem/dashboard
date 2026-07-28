// GET /api/whoop/logout — forgets the stored WHOOP refresh token (disconnect).
const L = require('./_lib');

module.exports = (req, res) => {
  const secure = L.isHttps(req);
  res.setHeader('Set-Cookie', [L.clearCookie('whoop_refresh', secure), L.clearCookie('whoop_state', secure)]);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ connected: false }));
};
