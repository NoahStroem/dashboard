// GET /api/fitbit/data — refreshes the access token (rotating the stored refresh
// token), fetches recent sleep / resting HR / HRV, and returns a vitals payload
// in the same shape the suite uses (source:'fitbit'). Same-origin → no CORS.
//
// Note: Fitbit has no universal "recovery score" (Daily Readiness is Premium-only
// and not reliably exposed), so `recovery` is null — sleep, HRV, RHR and the
// bed/wake times still populate, which is what the day-window + supplements use.
const L = require('./_lib');

function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function clockOf(iso) { // Fitbit times are local, no tz suffix: "2024-05-30T23:11:30.000"
  const m = String(iso || '').match(/T(\d{2}):(\d{2})/);
  return m ? m[1] + ':' + m[2] : null;
}
async function get(path, token) {
  try {
    const r = await fetch(L.API_BASE + path, { headers: { Authorization: 'Bearer ' + token, 'Accept-Language': 'en_US' } });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cookies = L.parseCookies(req);
  const secure = L.isHttps(req);
  const refresh = cookies.fitbit_refresh;
  if (!refresh) { res.statusCode = 200; res.end(JSON.stringify({ connected: false })); return; }

  let id;
  try { ({ id } = L.creds()); }
  catch (e) { res.statusCode = 200; res.end(JSON.stringify({ connected: false, error: 'not_configured' })); return; }

  let tok;
  try {
    tok = await L.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch (e) {
    res.statusCode = 200;
    res.setHeader('Set-Cookie', L.clearCookie('fitbit_refresh', secure));
    res.end(JSON.stringify({ connected: false, error: 'expired' }));
    return;
  }
  // Fitbit rotates refresh tokens — persist the new one.
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    res.setHeader('Set-Cookie', L.cookie('fitbit_refresh', tok.refresh_token, { maxAge: 60 * 60 * 24 * 365, secure }));
  }
  const at = tok.access_token;

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const [heart, hrv, sleep] = await Promise.all([
    get('/1/user/-/activities/heart/date/today/1d.json', at),
    get('/1/user/-/hrv/date/today.json', at),
    get('/1.2/user/-/sleep/date/' + dateStr(weekAgo) + '/' + dateStr(today) + '.json', at),
  ]);

  const rhr = heart && heart['activities-heart'] && heart['activities-heart'][0]
    ? heart['activities-heart'][0].value && heart['activities-heart'][0].value.restingHeartRate
    : null;
  const dailyRmssd = hrv && Array.isArray(hrv.hrv) && hrv.hrv.length
    ? (hrv.hrv[hrv.hrv.length - 1].value || {}).dailyRmssd
    : null;

  // Latest main sleep from the range (fall back to the longest log).
  let main = null;
  if (sleep && Array.isArray(sleep.sleep) && sleep.sleep.length) {
    const logs = sleep.sleep.slice().sort((a, b) => String(b.startTime).localeCompare(String(a.startTime)));
    main = logs.find(s => s.isMainSleep) || logs.slice().sort((a, b) => (b.minutesAsleep || 0) - (a.minutesAsleep || 0))[0];
  }
  const sleepHours = main && main.minutesAsleep != null ? Math.round((main.minutesAsleep / 60) * 100) / 100 : null;
  const sleepPerf = main && main.efficiency != null ? Math.round(main.efficiency) : null;
  const bedtime = main ? clockOf(main.startTime) : null;
  const wakeTime = main ? clockOf(main.endTime) : null;

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    recovery: null,                       // Fitbit exposes no universal recovery score
    hrv: dailyRmssd != null ? Math.round(dailyRmssd) : null,
    rhr: rhr != null ? Math.round(rhr) : null,
    sleepPerf,
    sleepHours,
    sleepTargetHours: 8,
    bedtime,
    wakeTime,
    strain: null,
  }));
};
