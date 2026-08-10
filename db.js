/* ============================================================
 * db.js — cross-device sync for the Patron / Liam suite.
 *
 * Design: PER-KEY last-write-wins.
 *   One Supabase row holds a map of { localStorage key -> { s: value, t: ts } }.
 *   Each device tracks, per key, the value-hash + timestamp it last agreed with
 *   the cloud on. A key whose local hash no longer matches is a local edit and
 *   gets a fresh timestamp; everything else is left alone. Sync = fetch the
 *   cloud map, overlay this device's edits, write back, adopt the result.
 *
 * Why not the old whole-blob snapshot: with one timestamp for the entire device,
 * any push overwrote every key. Device A logs water, device B (whose tab still
 * held yesterday's state) pushes for an unrelated reason, and A's water is gone —
 * "my changes never arrive". Per-key stamps mean two devices editing different
 * pages both keep their work; only the same key edited on both sides conflicts,
 * and there the newer edit wins.
 *
 * Deletions ride along as tombstones ({ s: null }), so removing an entry on one
 * device actually removes it on the other instead of being resurrected.
 *
 * Timestamps are monotonic per device (always greater than the highest ts seen,
 * cloud included) so a device whose clock is wrong can't win — or lose — forever.
 *
 * Include once per page, AFTER the Supabase library:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="db.js"></script>
 *
 * With no working cloud connection everything falls back to localStorage
 * (this device only) so the app never breaks.
 * ============================================================ */
window.PatronDB = (function () {
  // Key resolution (first non-empty wins) — NO keys hardcoded here, so each fork
  // connects to its OWN database, never the original author's:
  //   1. localStorage override (user pasted keys via the ☁ panel)
  //   2. /api/config  (THIS deploy's Vercel env vars: SUPABASE_URL / SUPABASE_ANON_KEY)
  // A fresh fork with no env vars set stays local-only until its owner adds them.
  const _ovUrl = (localStorage.getItem('po_supabase_url') || '').trim();
  const _ovKey = (localStorage.getItem('po_supabase_key') || '').trim();

  let URL = _ovUrl;
  let KEY = _ovKey;
  let ready = false;
  let sb = null;

  const SNAP_KEY = 'patron-device-snapshot'; // the single row holding the key map
  const MAP_KEY = 'po_sync_map';             // {key: [hash, ts]} we last agreed with the cloud
  const TS_KEY = 'po_snapshot_ts';           // highest ts this device has ever seen
  const PH_KEY = 'po_snapshot_hash';         // legacy (v1) — removed on first run
  const TOMB_MS = 30 * 24 * 3600 * 1000;     // forget tombstones after 30 days

  function _connect(u, k) {
    ready = !!(u && k && window.supabase && u.indexOf('PASTE-') !== 0);
    sb = ready ? window.supabase.createClient(u, k) : null;
  }
  _connect(URL, KEY);

  function isCloud() { return ready; }
  function cfgUrl() { return URL || ''; }
  function cfgKey() { return KEY || ''; }

  /* ---- which localStorage keys ride in the sync ----
   * Everything EXCEPT this device's connection/bookkeeping settings and
   * per-device preferences. All actual app data rides along. */
  function _skip(k) {
    return !k
      || k.indexOf('po_supabase') === 0
      || k === TS_KEY || k === PH_KEY || k === MAP_KEY
      || k === 'patron_theme'                   // theme is a per-device preference
      || k === 'peak_schedule_v1'               // schedule is regenerated from the file (seed) — never sync stale tasks
      || k === 'po_sched_purged'                // legacy per-device flag
      || k.indexOf('patron_hydrated_') === 0
      || k.indexOf('patron_initreload_') === 0
      || k.indexOf('patron_snapadopt_') === 0;
  }

  /* ---- local read/write API (used by the Progress page etc.) ---- */
  function _local(key) { try { return JSON.parse(localStorage.getItem('patron_db_' + key) || 'null'); } catch (_) { return null; } }
  function _saveLocal(key, v) { try { localStorage.setItem('patron_db_' + key, JSON.stringify(v)); } catch (_) {} }
  async function get(key) { return _local(key); }
  async function set(key, value) { _saveLocal(key, value); _schedulePush(); }
  function subscribe(_key, _cb) { return function () {}; } // adopt-path reloads; shim is enough

  /* ---- progress photos: file -> Supabase Storage, only the URL is kept locally
   * (and therefore rides in the sync). ---- */
  async function uploadImage(bucket, path, dataUrl, contentType) {
    if (!sb) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: contentType || 'image/jpeg', upsert: true });
      if (error) return null;
      const { data } = sb.storage.from(bucket).getPublicUrl(path);
      return (data && data.publicUrl) ? data.publicUrl : null;
    } catch (_) { return null; }
  }
  async function deleteImage(bucket, path) {
    if (!sb || !path) return;
    try { await sb.storage.from(bucket).remove([path]); } catch (_) {}
  }

  /* ============================================================
   * SYNC ENGINE
   * ============================================================ */

  // djb2. The v1 engine used the entire concatenated localStorage as its
  // "hash" AND stored that string back into localStorage — doubling usage and
  // throwing QuotaExceeded on phones, which silently wedged sync.
  function _h(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function _gather() {
    const blob = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (_skip(k)) continue;
      const v = localStorage.getItem(k);
      if (v != null) blob[k] = v;
    }
    return blob;
  }

  function _loadMap() { try { return JSON.parse(localStorage.getItem(MAP_KEY) || 'null') || null; } catch (_) { return null; } }
  function _saveMap(m) { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch (_) {} }

  // Monotonic clock: never emit a ts <= the highest one we've seen anywhere, so
  // a device with a skewed clock can't stamp the future and win every conflict
  // from then on.
  let _hiTs = (function () { const n = parseInt(localStorage.getItem(TS_KEY) || '0', 10); return isNaN(n) ? 0 : n; })();
  // The ts we booted with, captured before any sync moves _hiTs. The one-time
  // migration below has to compare the cloud against where this device *was*,
  // not against a value this run already advanced.
  const _bootTs = _hiTs;
  function _seeTs(t) { if (t > _hiTs) { _hiTs = t; try { localStorage.setItem(TS_KEY, String(t)); } catch (_) {} } }
  function _now() { const t = Math.max(Date.now(), _hiTs + 1); _seeTs(t); return t; }

  // Keys changed on THIS device since we last agreed with the cloud.
  // { key: {s: value|null, h: hash|null} } — s === null means deleted here.
  function _localEdits(map) {
    const blob = _gather(), out = {};
    for (const k in blob) {
      const h = _h(blob[k]);
      const e = map[k];
      if (!e || e[0] !== h) out[k] = { s: blob[k], h: h };
    }
    for (const k in map) {
      if (map[k][0] !== null && !(k in blob)) out[k] = { s: null, h: null };
    }
    return out;
  }
  function _hasLocalEdits() { const m = _loadMap(); return !m || Object.keys(_localEdits(m)).length > 0; }

  // Read the cloud row. Returns null on a failed request (so we never mistake a
  // network error for "the cloud is empty" and clobber it).
  async function _fetchCloud() {
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('app_state').select('data').eq('key', SNAP_KEY).maybeSingle();
      if (error) return null;
      const d = data && data.data;
      const keys = {};
      if (d && d.v === 2 && d.keys) {
        for (const k in d.keys) { if (!_skip(k)) keys[k] = d.keys[k]; }
      } else if (d && d.blob) {
        // v1 whole-blob snapshot: one timestamp for everything.
        const t = d.ts || 1;
        for (const k in d.blob) { if (!_skip(k)) keys[k] = { s: d.blob[k], t: t }; }
      }
      let hi = 0;
      for (const k in keys) if (keys[k].t > hi) hi = keys[k].t;
      return { keys: keys, ts: (d && d.ts) || hi, legacy: !!(d && d.v !== 2) };
    } catch (_) { return null; }
  }

  async function _writeCloud(keys) {
    let hi = 0;
    for (const k in keys) if (keys[k].t > hi) hi = keys[k].t;
    try {
      const { error } = await sb.from('app_state').upsert(
        { key: SNAP_KEY, data: { v: 2, keys: keys, ts: hi }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      return !error;
    } catch (_) { return false; }
  }

  // Write a merged map into localStorage. Returns true if anything actually
  // changed here (i.e. the cloud told us something new) — that's what decides
  // whether the page needs a reload to re-render.
  function _adopt(keys) {
    let changed = false;
    for (const k in keys) {
      if (_skip(k)) continue;
      const s = keys[k].s;
      try {
        if (s === null) {
          if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); changed = true; }
        } else if (localStorage.getItem(k) !== s) {
          localStorage.setItem(k, s); changed = true;
        }
      } catch (_) {}
    }
    return changed;
  }

  function _mapFrom(keys) {
    const m = {};
    for (const k in keys) m[k] = [keys[k].s === null ? null : _h(keys[k].s), keys[k].t];
    return m;
  }

  function _prune(keys) {
    const cut = Date.now() - TOMB_MS;
    for (const k in keys) if (keys[k].s === null && keys[k].t < cut) delete keys[k];
    return keys;
  }

  /* ---- one-time migration off the v1 whole-blob format ----
   * No local map yet, so we can't tell an edit from a value we simply never
   * pushed. Fall back to v1's own rule for this single transition: if the cloud
   * snapshot is newer than the last one this device synced, the cloud wins;
   * otherwise this device's state is the truth. After this, per-key stamps take
   * over and the question never comes up again. */
  function _seedMap(cloud) {
    if (cloud && cloud.ts > _bootTs && Object.keys(cloud.keys).length) {
      // Cloud won. Seed the map from it and report "no local edits" — the normal
      // merge path below then adopts those values (and reloads) for us.
      _saveMap(_mapFrom(cloud.keys));
      _seeTs(cloud.ts);
      return true;
    }
    // This device is the truth: seed from the cloud so unchanged keys aren't
    // re-stamped, and let _localEdits pick up everything that differs.
    _saveMap(cloud ? _mapFrom(cloud.keys) : {});
    return false;
  }

  let _pushTimer = null;
  let _syncing = false;

  async function _sync(allowReload) {
    if (!ready || _syncing) return false;
    _syncing = true;
    try {
      const cloud = await _fetchCloud();
      if (cloud === null) return false; // offline / error — do NOT overwrite the cloud
      _seeTs(cloud.ts || 0);

      let map = _loadMap();
      let seeded = false;
      if (!map) { seeded = _seedMap(cloud); map = _loadMap() || {}; }
      try { localStorage.removeItem(PH_KEY); } catch (_) {} // free the v1 shadow copy

      const edits = seeded ? {} : _localEdits(map);
      const merged = {};
      for (const k in cloud.keys) merged[k] = cloud.keys[k];

      const editKeys = Object.keys(edits);
      if (editKeys.length) {
        const t = _now();
        for (const k of editKeys) merged[k] = { s: edits[k].s, t: t };
      }
      _prune(merged);

      const changed = _adopt(merged);
      _saveMap(_mapFrom(merged));
      for (const k in merged) _seeTs(merged[k].t);

      // Push when we have edits, or when the cloud is still on the v1 format.
      if (editKeys.length || cloud.legacy) {
        if (!(await _writeCloud(merged))) _saveMap(map); // failed: stay dirty, retry later
      }

      // `changed` is only ever true for values the cloud brought us — our own
      // edits were already in localStorage before we adopted. allowReload is
      // false on the debounced save path, so a sync triggered by typing never
      // yanks the page out from under you; only load / focus / realtime can.
      if (changed && allowReload) {
        const guard = 'patron_snapadopt_' + _hiTs;
        try {
          if (!sessionStorage.getItem(guard)) { sessionStorage.setItem(guard, '1'); location.reload(); }
        } catch (_) { location.reload(); }
      }
      return true;
    } finally { _syncing = false; }
  }

  function _schedulePush() {
    if (!ready) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () { _pushTimer = null; _sync(false); }, 1200);
  }

  function _startSync() {
    if (!ready) return;
    (async function () {
      await _sync(true);
      // Cheap local check first — only talk to the network when this device
      // actually has something to say.
      setInterval(function () { if (_hasLocalEdits()) _sync(false); }, 2500);
      window.addEventListener('storage', _schedulePush);
      function refresh() { if (!document.hidden) _sync(true); }
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('focus', refresh);
      try {
        sb.channel('snap').on('postgres_changes',
          { event: '*', schema: 'public', table: 'app_state', filter: 'key=eq.' + SNAP_KEY },
          function () { _sync(true); }).subscribe();
      } catch (_) {}
    })();
  }

  if (ready) { _startSync(); }
  (async function _loadConfig() {
    if (_ovUrl && _ovKey) return;
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      if (!r.ok) return;
      const cfg = await r.json();
      const u = (cfg && cfg.url || '').trim(), k = (cfg && cfg.key || '').trim();
      if (u && k && !ready) {
        URL = u; KEY = k; _connect(u, k); _startSync();
        // Tell the UI sync just came online. Without this anything that read
        // isCloud() at load time (the ☁ button) would be stuck showing
        // "local-only" forever on the env-var path, where this fetch — not a
        // pasted key — is what connects us.
        if (ready) { try { window.dispatchEvent(new Event('patrondb:ready')); } catch (_) {} }
      }
    } catch (_) {}
  })();

  /* ---- explicit helpers (the ☁ panel's manual override) ---- */
  // Make the cloud match THIS device exactly, including deleting keys the cloud
  // has and we don't.
  async function pushAll() {
    if (!ready) return { ok: false, n: 0 };
    const cloud = await _fetchCloud();
    const blob = _gather(), t = _now(), keys = {};
    if (cloud) { for (const k in cloud.keys) if (!(k in blob)) keys[k] = { s: null, t: t }; }
    for (const k in blob) keys[k] = { s: blob[k], t: t };
    _prune(keys);
    const ok = await _writeCloud(keys);
    if (ok) _saveMap(_mapFrom(keys));
    return { ok: ok, n: Object.keys(blob).length };
  }
  // Make THIS device match the cloud exactly.
  async function pullAll() {
    const cloud = await _fetchCloud();
    if (!cloud || !Object.keys(cloud.keys).length) return { ok: false, n: 0 };
    const blob = _gather(), keys = {};
    for (const k in cloud.keys) keys[k] = cloud.keys[k];
    for (const k in blob) if (!(k in keys)) keys[k] = { s: null, t: cloud.ts || _now() };
    _adopt(keys);
    _saveMap(_mapFrom(keys));
    _seeTs(cloud.ts || 0);
    try { sessionStorage.setItem('patron_snapadopt_' + _hiTs, '1'); } catch (_) {}
    return { ok: true, n: Object.keys(cloud.keys).length };
  }

  return { isCloud, cfgUrl, cfgKey, get, set, subscribe, uploadImage, deleteImage, pushAll, pullAll };
})();
