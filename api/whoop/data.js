// GET /api/whoop/data — refreshes the access token (rotating the stored refresh
// token), fetches recent recovery / sleep / cycle, and returns a vitals payload:
//   • latest scalars (recovery, hrv, rhr, sleepPerf, sleepHours, strain) — used by the hub
//   • short history arrays (recoveryTrend, sleepDebt7d, strainWeeklyAvg) — used by whoop.html
// Same-origin, so the browser hits it with no CORS.
const L = require('./_lib');

function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj, ok = true;
    for (const k of p.split('.')) { if (cur && typeof cur === 'object' && k in cur) cur = cur[k]; else { ok = false; break; } }
    if (ok && cur != null) return cur;
  }
  return null;
}
async function list(path, token) {
  try {
    const r = await fetch(L.API_BASE + path, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    if (!j) return [];
    return Array.isArray(j.records) ? j.records : (Array.isArray(j) ? j : []);
  } catch (e) { return []; }
}
function asleepHours(slp) {
  if (!slp) return null;
  const light = pick(slp, ['score.stage_summary.total_light_sleep_time_milli']);
  const sws = pick(slp, ['score.stage_summary.total_slow_wave_sleep_time_milli']);
  const rem = pick(slp, ['score.stage_summary.total_rem_sleep_time_milli']);
  const inBed = pick(slp, ['score.stage_summary.total_in_bed_time_milli', 'total_in_bed_time_milli']);
  const awake = pick(slp, ['score.stage_summary.total_awake_time_milli']) || 0;
  let ms = null;
  if (light != null || sws != null || rem != null) ms = (light || 0) + (sws || 0) + (rem || 0);
  else if (inBed != null) ms = inBed - awake;
  return ms != null ? Math.round((ms / 3600000) * 100) / 100 : null;
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cookies = L.parseCookies(req);
  const secure = L.isHttps(req);
  const refresh = cookies.whoop_refresh;
  if (!refresh) { res.statusCode = 200; res.end(JSON.stringify({ connected: false })); return; }

  let id, secret;
  try { ({ id, secret } = L.creds()); }
  catch (e) { res.statusCode = 200; res.end(JSON.stringify({ connected: false, error: 'not_configured' })); return; }

  let tok;
  try {
    tok = await L.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: id, client_secret: secret, scope: 'offline' });
  } catch (e) {
    res.statusCode = 200;
    res.setHeader('Set-Cookie', L.clearCookie('whoop_refresh', secure));
    res.end(JSON.stringify({ connected: false, error: 'expired' }));
    return;
  }
  // WHOOP rotates refresh tokens — persist the new one.
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    res.setHeader('Set-Cookie', L.cookie('whoop_refresh', tok.refresh_token, { maxAge: 60 * 60 * 24 * 365, secure }));
  }
  const at = tok.access_token;

  const [recs, slps, cycs] = await Promise.all([
    list('/v2/recovery?limit=14', at),
    list('/v2/activity/sleep?limit=7', at),
    list('/v2/cycle?limit=7', at),
  ]);
  const rec = recs[0] || null, slp = slps[0] || null, cyc = cycs[0] || null;

  const recovery = pick(rec, ['score.recovery_score', 'recovery_score']);
  const hrv = pick(rec, ['score.hrv_rmssd_milli', 'hrv_rmssd_milli']);
  const rhr = pick(rec, ['score.resting_heart_rate', 'resting_heart_rate']);
  const sleepPerf = pick(slp, ['score.sleep_performance_percentage', 'sleep_performance_percentage']);
  const sleepHours = asleepHours(slp);
  const strain = pick(cyc, ['score.strain', 'strain']);

  // History (oldest → newest) for the standalone's trend + sleep-debt views.
  const recoveryTrend = recs.map(r => pick(r, ['score.recovery_score', 'recovery_score'])).filter(v => v != null).reverse();
  const sleepDebt7d = slps.map(s => {
    const start = pick(s, ['start']);
    const day = start ? new Date(start).toLocaleDateString('en-US', { weekday: 'short' }) : '';
    const hours = asleepHours(s);
    return hours != null ? { day, hours } : null;
  }).filter(Boolean).reverse();
  const strains = cycs.map(c => pick(c, ['score.strain', 'strain'])).filter(v => v != null);
  const strainWeeklyAvg = strains.length ? Math.round((strains.reduce((a, b) => a + b, 0) / strains.length) * 10) / 10 : null;

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'whoop', ts: Date.now(),
    recovery: recovery != null ? Math.round(recovery) : null,
    hrv: hrv != null ? Math.round(hrv) : null,
    rhr: rhr != null ? Math.round(rhr) : null,
    sleepPerf: sleepPerf != null ? Math.round(sleepPerf) : null,
    sleepHours,
    sleepTargetHours: 8,
    strain: strain != null ? Math.round(strain * 10) / 10 : null,
    recoveryTrend,
    sleepDebt7d,
    strainWeeklyAvg,
  }));
};
