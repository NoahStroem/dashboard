// GET /api/fitbit/logout — forgets the stored Fitbit refresh token (disconnect).
const L = require('./_lib');

module.exports = (req, res) => {
  const secure = L.isHttps(req);
  res.setHeader('Set-Cookie', [L.clearCookie('fitbit_refresh', secure), L.clearCookie('fitbit_state', secure)]);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ connected: false }));
};
