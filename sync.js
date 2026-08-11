/* ============================================================
 * sync.js — LAYER 2: the sync engine.
 *
 * Offline-first. localStorage stays the source of truth for rendering: every
 * page reads it synchronously and works with no network at all. This engine
 * mirrors it to Postgres in the background.
 *
 * The cycle, once per trigger (a local edit, a realtime ping, a refocus, the
 * slow poll, or the Sync now button):
 *
 *   PULL   everything with seq > my cursor        (incremental — not the world)
 *   MERGE  each incoming row against local state  (three-way, see sync-merge.js)
 *   PUSH   only the keys in my outbox, each carrying the rev it was based on
 *
 * The push is a compare-and-set. If the server has moved past the rev an item
 * was based on, the write is REJECTED, the server hands back what it holds, we
 * merge it and try again. A device can therefore never overwrite a change it
 * has not already seen — which is the failure mode this replaces.
 *
 * Order matters:  sync-boot.js (head) → supabase-js → sync-merge.js → sync.js
 * ============================================================ */
window.PatronDB = (function () {
  'use strict';

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var URL_KEY = 'po_supabase_url', ANON_KEY = 'po_supabase_key';
  var _ovUrl = (localStorage.getItem(URL_KEY) || '').trim();
  var _ovKey = (localStorage.getItem(ANON_KEY) || '').trim();

  // ?rescue=1 — no automatic sync at all for this page load. Nothing is pulled
  // down over what this device holds and nothing is pushed up. The panel's
  // explicit Push/Pull are the only things that touch the server. This is the
  // way back when a device still holds data the server has lost.
  var RESCUE = /[?&]rescue\b/.test(location.search);

  var TABLE = 'sync_items';
  var PAGE = 500;            // rows per pull request
  var PUSH_BATCH = 100;      // items per push request
  var PUSH_DEBOUNCE = 800;   // ms after your last keystroke before we talk to the network
  var POLL_MS = 60000;       // safety net when realtime is not connected
  var POLL_MS_RT = 300000;   // safety net when it is
  var MAX_BASE = 64 * 1024;  // don't persist a merge base bigger than this

  /* ---- local bookkeeping (never synced) ---- */
  var K_CURSOR = 'sync_cursor';     // highest server seq adopted
  var K_META = 'sync_meta';         // { key: [rev, hash, lamport] } last agreed with the server
  var K_OUTBOX = 'sync_outbox';     // { key: {base, baseRev, lamport, deleted, weak, at} } pending
  var K_DEVICE = 'sync_device';     // this device's stable id
  var K_LAMPORT = 'sync_lamport';   // causal clock
  var K_LASTOK = 'sync_lastok';     // ms timestamp of the last clean sync
  var K_MIGRATED = 'sync_migrated'; // v2 blob imported

  var boot = window.__syncBoot || {
    baseline: {}, writes: {}, origin: 'user', onWrite: function () {},
    as: function (o, fn) { return fn(); },
    raw: { setItem: function (k, v) { localStorage.setItem(k, v); },
           removeItem: function (k) { localStorage.removeItem(k); } }
  };

  /* ---- which keys ride along ---- */
  function _skip(k) {
    return !k
      || k.indexOf('po_supabase') === 0
      || k.indexOf('sync_') === 0                 // this engine's own bookkeeping
      || k === 'po_sync_map' || k === 'po_snapshot_ts' || k === 'po_snapshot_hash'
      || k === 'patron_theme'                     // per-device preference
      || k === 'peak_schedule_v1'                 // regenerated from the file
      || k === 'po_sched_purged'
      || k.indexOf('patron_hydrated_') === 0
      || k.indexOf('patron_initreload_') === 0
      || k.indexOf('patron_snapadopt_') === 0;
  }

  /* ============================================================
   * LAYER 1: LOCAL STORE
   * ============================================================ */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function jsonGet(k, dflt) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : dflt; } catch (_) { return dflt; } }
  function jsonSet(k, v) { try { boot.raw.setItem(k, JSON.stringify(v)); } catch (_) {} }

  function hash(s) {
    if (s === null || s === undefined) return null;
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  var meta = jsonGet(K_META, {});      // key -> [rev, hash, lamport]
  var outbox = jsonGet(K_OUTBOX, {});  // key -> pending change
  var cursor = parseInt(lsGet(K_CURSOR) || '0', 10) || 0;
  var lamport = parseInt(lsGet(K_LAMPORT) || '0', 10) || 0;
  var deviceId = lsGet(K_DEVICE);
  if (!deviceId) {
    deviceId = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { boot.raw.setItem(K_DEVICE, deviceId); } catch (_) {}
  }

  // The value we last agreed with the server, per key. In memory only: keeping
  // a second copy of everything in localStorage is what made the original
  // engine blow the storage quota on phones. We seed it from the boot snapshot
  // for keys that were in sync when the page loaded, which covers ~every case.
  var agreed = {};
  (function seedAgreed() {
    for (var k in boot.baseline) {
      if (_skip(k)) continue;
      var m = meta[k];
      if (m && m[1] === hash(boot.baseline[k])) agreed[k] = boot.baseline[k];
    }
  })();

  function saveMeta() { jsonSet(K_META, meta); }
  function saveOutbox() { jsonSet(K_OUTBOX, outbox); }
  function setCursor(v) { cursor = v; try { boot.raw.setItem(K_CURSOR, String(v)); } catch (_) {} }
  function seeLamport(t) { if (t > lamport) { lamport = t; try { boot.raw.setItem(K_LAMPORT, String(t)); } catch (_) {} } }
  function nextLamport() { lamport = lamport + 1; try { boot.raw.setItem(K_LAMPORT, String(lamport)); } catch (_) {} return lamport; }

  function pendingCount() { var n = 0; for (var k in outbox) if (!outbox[k].weak) n++; return n; }

  /* ============================================================
   * STATUS — what the indicator shows
   * ============================================================ */
  var STATE = { LOCAL: 'local', SIGNED_OUT: 'signed-out', OFFLINE: 'offline',
                SYNCING: 'syncing', SYNCED: 'synced', ERROR: 'error', RESCUE: 'rescue' };
  var state = RESCUE ? STATE.RESCUE : STATE.LOCAL;
  var lastError = null;
  var lastOk = parseInt(lsGet(K_LASTOK) || '0', 10) || 0;
  var session = null;

  function status() {
    return {
      state: state,
      pending: pendingCount(),
      lastSyncedAt: lastOk || null,
      error: lastError,
      email: session && session.user ? session.user.email : null,
      device: deviceId,
      rescue: RESCUE
    };
  }
  function setState(s, err) {
    if (s === state && (err || null) === lastError) return;
    state = s; lastError = err || null;
    emit('patron:sync-status', status());
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (_) {}
  }

  /* ============================================================
   * LAYER 3/4: BACKEND — Supabase (PostgREST + RPC + Realtime)
   * ============================================================ */
  var url = _ovUrl, key = _ovKey, sb = null, connected = false;

  function connect(u, k) {
    connected = !!(u && k && window.supabase && u.indexOf('PASTE-') !== 0);
    sb = connected ? window.supabase.createClient(u, k, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    }) : null;
    return connected;
  }
  function isCloud() { return !!(connected && session); }
  function cfgUrl() { return url || ''; }
  function cfgKey() { return key || ''; }

  /* ---- auth: one login per device, and that login is what scopes your rows ----
   *
   * Password is the primary path. Supabase's built-in mail service won't let you
   * edit the email template without custom SMTP, and the stock template sends a
   * link with no code in it — which is unusable on a phone, where tapping a link
   * in a mail app opens a different browser than the one holding the unfinished
   * sign-in. Password needs no email delivery at all.
   *
   * The one-time-code path below still works if you ever set up SMTP. */
  async function signInPassword(email, password) {
    if (!sb) return { ok: false, error: 'No Supabase project configured.' };
    var r = await sb.auth.signInWithPassword({ email: String(email).trim(), password: password });
    if (r.error) {
      var m = r.error.message || '', code = r.error.code || '';
      return {
        ok: false,
        error: m + (code ? ' (' + code + ')' : ''),
        badCreds: /invalid login credentials/i.test(m),
        // Supabase often reports an unconfirmed account as bad credentials
        // rather than saying so, to avoid confirming which emails exist.
        unconfirmed: code === 'email_not_confirmed' || /not confirmed/i.test(m)
      };
    }
    return { ok: true };
  }
  async function signUpPassword(email, password) {
    if (!sb) return { ok: false, error: 'No Supabase project configured.' };
    var r = await sb.auth.signUp({ email: String(email).trim(), password: password });
    if (r.error) {
      var msg = r.error.message || '';
      return { ok: false, error: msg, exists: /already registered|already exists/i.test(msg) };
    }
    // No session back means the project still requires email confirmation, so
    // the account exists but cannot sign in yet.
    if (!r.data || !r.data.session) return { ok: true, needsConfirm: true };
    return { ok: true };
  }

  // One call sends the email; what arrives depends on the Supabase template.
  // A template containing {{ .Token }} gives a 6-digit code, which is the
  // reliable path on a phone — a magic link opened from a mail app can land in
  // a different browser than the one that started the sign-in, and then it
  // can't complete. emailRedirectTo makes the link work too, by pointing back
  // at the page you started from instead of the project's Site URL default.
  async function signIn(email) {
    if (!sb) return { ok: false, error: 'No Supabase project configured.' };
    var back = location.origin + location.pathname;
    var r = await sb.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: true, emailRedirectTo: back }
    });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true };
  }
  async function verifyCode(email, token) {
    if (!sb) return { ok: false, error: 'No Supabase project configured.' };
    var r = await sb.auth.verifyOtp({ email: email, token: String(token).trim(), type: 'email' });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true };
  }
  async function signOut() {
    if (sb) { try { await sb.auth.signOut(); } catch (_) {} }
    session = null; setState(STATE.SIGNED_OUT);
  }

  /* ============================================================
   * CHANGE TRACKING — what counts as an edit
   * ============================================================ */
  function markDirty(k, origin) {
    if (_skip(k) || origin === 'engine') return;
    var cur = lsGet(k);
    var prev = agreed.hasOwnProperty(k) ? agreed[k] : undefined;

    // Reverted to what the server already has: nothing to send.
    if (prev !== undefined && cur === prev) {
      if (outbox[k]) { delete outbox[k]; saveOutbox(); emit('patron:sync-status', status()); }
      return;
    }

    var weak = (origin === 'boot');
    var e = outbox[k];
    if (e) {
      // A real edit on top of a boot rewrite makes the whole thing a real edit.
      e.weak = e.weak && weak;
      e.deleted = (cur === null);
      e.lamport = nextLamport();
      e.at = Date.now();
    } else {
      var base = prev !== undefined ? prev : null;
      outbox[k] = {
        base: (base != null && base.length > MAX_BASE) ? null : base,
        baseRev: meta[k] ? meta[k][0] : 0,
        lamport: nextLamport(),
        deleted: (cur === null),
        weak: weak,
        at: Date.now()
      };
    }
    saveOutbox();
    emit('patron:sync-status', status());
    if (!weak) schedulePush();
  }

  boot.onWrite(markDirty);
  // Another tab on this device edited something.
  window.addEventListener('storage', function (e) {
    if (e && e.key) markDirty(e.key, 'user');
  });

  /* ---- first run: everything on this device is pending ----
   * With no meta and no cursor we have never spoken to this account. Treat every
   * local key as a change to send. Combined with pull-then-push, connecting a
   * second device UNIONS the two devices instead of making you pick a winner. */
  function seedFirstRun() {
    if (Object.keys(meta).length || cursor) return;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (_skip(k) || outbox[k]) continue;
      outbox[k] = { base: null, baseRev: 0, lamport: nextLamport(), deleted: false, weak: false, at: Date.now() };
    }
    saveOutbox();
  }

  /* ============================================================
   * APPLYING REMOTE ROWS
   * ============================================================ */
  var changedKeys = [];

  // sync-merge.js, looked up through window rather than as a bare global so a
  // missing <script> tag fails loudly here instead of mid-merge. Without it we
  // keep the server's value: refusing to merge must never mean overwriting
  // someone else's data with ours.
  function mergeValues(k, base, local, remote, ctx) {
    var M = window.PatronMerge;
    if (M && M.merge) return M.merge(k, base, local, remote, ctx);
    setState(STATE.ERROR, 'sync-merge.js is not loaded — conflicts cannot be merged.');
    return { value: remote, how: 'remote' };
  }

  function writeLocal(k, v) {
    boot.as('engine', function () {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch (_) {}
    });
  }

  function applyRow(row) {
    var k = row.key;
    if (_skip(k)) return;
    var remote = row.deleted ? null : row.value;
    seeLamport(row.lamport || 0);

    var e = outbox[k];
    var cur = lsGet(k);

    if (!e) {
      if (cur !== remote) { writeLocal(k, remote); changedKeys.push(k); }
    } else if (e.weak) {
      // A boot rewrite versus a real change from another device.
      //
      // A deletion made during start-up is discarded outright — that is the
      // exact move that erased two days of vitals, and nothing a page does
      // while loading should be able to delete another device's data.
      //
      // Anything else still merges, but with the other device winning every
      // direct collision. Union, not surrender: if this device's start-up left
      // behind a day the other one never had, that day survives. It just can't
      // overwrite anything.
      if (cur === null) {
        if (remote !== null) { writeLocal(k, remote); changedKeys.push(k); }
        delete outbox[k];
      } else {
        var w = mergeValues(k, e.base, cur, remote, {
          localLamport: 0, remoteLamport: 1,        // remote wins any tie
          localDevice: '', remoteDevice: row.device_id || ''
        });
        if (w.value !== cur) { writeLocal(k, w.value); changedKeys.push(k); }
        if (w.value === remote) {
          delete outbox[k];
        } else {
          // Now a superset of what the server holds, so it is safe to send.
          e.weak = false;
          e.base = (remote != null && remote.length > MAX_BASE) ? null : remote;
          e.baseRev = row.rev;
          e.deleted = false;
          e.lamport = nextLamport();
        }
      }
    } else {
      var res = mergeValues(k, e.base, cur, remote, {
        localLamport: e.lamport, remoteLamport: row.lamport || 0,
        localDevice: deviceId, remoteDevice: row.device_id || ''
      });
      if (res.value !== cur) { writeLocal(k, res.value); changedKeys.push(k); }
      if (res.value === remote) {
        delete outbox[k];                       // server already holds the answer
      } else {
        e.base = (remote != null && remote.length > MAX_BASE) ? null : remote;
        e.baseRev = row.rev;
        e.deleted = (res.value === null);
        e.lamport = nextLamport();
      }
    }

    meta[k] = [row.rev, hash(remote), row.lamport || 0];
    agreed[k] = remote;
  }

  function flushChanges() {
    if (!changedKeys.length) return;
    var keys = changedKeys.slice();
    changedKeys = [];
    saveMeta(); saveOutbox();
    emit('patron:sync-change', { keys: keys });
    notifyPages(keys);
  }

  /* ---- telling the page its data moved ----
   * A page that registers PatronDB.onChange re-renders in place. Pages that
   * don't get a reload, but never while you are mid-sentence. */
  var changeHandlers = [];
  var reloadTimer = null;
  function onChange(fn) { if (typeof fn === 'function') changeHandlers.push(fn); return function () { changeHandlers = changeHandlers.filter(function (f) { return f !== fn; }); }; }

  function busyTyping() {
    try {
      var el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
    } catch (_) {}
    for (var k in boot.writes) {
      if (boot.writes[k].origin === 'user' && Date.now() - boot.writes[k].t < 8000) return true;
    }
    return false;
  }
  function notifyPages(keys) {
    if (changeHandlers.length) {
      for (var i = 0; i < changeHandlers.length; i++) { try { changeHandlers[i](keys); } catch (_) {} }
      return;
    }
    if (reloadTimer) clearTimeout(reloadTimer);
    function attempt() {
      reloadTimer = null;
      // Never yank the page out from under someone mid-entry; wait for a gap.
      if (busyTyping()) { reloadTimer = setTimeout(attempt, 4000); return; }
      try { location.reload(); } catch (_) {}
    }
    reloadTimer = setTimeout(attempt, 1200);
  }

  /* ============================================================
   * PULL — incremental, cursor-based
   * ============================================================ */
  async function pull() {
    var moved = false;
    for (;;) {
      var r = await sb.from(TABLE)
        .select('key,value,deleted,rev,lamport,device_id,seq')
        .gt('seq', cursor).order('seq', { ascending: true }).limit(PAGE);
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) break;
      for (var i = 0; i < rows.length; i++) applyRow(rows[i]);
      setCursor(rows[rows.length - 1].seq);
      moved = true;
      if (rows.length < PAGE) break;
    }
    if (moved) { saveMeta(); saveOutbox(); }
    return moved;
  }

  /* ============================================================
   * PUSH — compare-and-set, with merge-and-retry on rejection
   * ============================================================ */
  async function push(round) {
    round = round || 0;
    var keys = [], k;
    for (k in outbox) { if (!outbox[k].weak) keys.push(k); }
    if (!keys.length) return false;
    keys = keys.slice(0, PUSH_BATCH);

    var items = [], sent = {};
    for (var i = 0; i < keys.length; i++) {
      k = keys[i];
      var v = lsGet(k), e = outbox[k];
      sent[k] = v;
      items.push({ key: k, value: v, deleted: v === null, base_rev: e.baseRev, lamport: e.lamport });
    }

    var r = await sb.rpc('sync_push', { p_items: items, p_device: deviceId });
    if (r.error) throw r.error;
    var out = r.data || { accepted: [], conflicts: [] };

    (out.accepted || []).forEach(function (a) {
      meta[a.key] = [a.rev, hash(sent[a.key]), a.lamport];
      agreed[a.key] = sent[a.key];
      seeLamport(a.lamport || 0);
      // If it changed again while the request was in flight, keep it pending —
      // but rebased onto the rev the server just gave us.
      if (lsGet(a.key) === sent[a.key]) delete outbox[a.key];
      else if (outbox[a.key]) { outbox[a.key].baseRev = a.rev; outbox[a.key].base = sent[a.key]; }
      // Our own row will come back on the next pull; don't re-apply it.
      if (a.seq > cursor) setCursor(a.seq);
    });

    var conflicts = out.conflicts || [];
    conflicts.forEach(function (row) { applyRow(row); });

    saveMeta(); saveOutbox();
    flushChanges();

    // Rejected items were just merged and rebased — send the result. Bounded so
    // a pathological ping-pong can't spin forever; the next cycle picks it up.
    if (conflicts.length && round < 3) return await push(round + 1);
    return true;
  }

  /* ============================================================
   * THE CYCLE
   * ============================================================ */
  var running = false, queued = false, failures = 0, retryTimer = null;
  var firstPullDone = false;

  async function cycle(reason) {
    if (!isCloud() || RESCUE) return false;
    if (running) { queued = true; return false; }
    running = true;
    setState(STATE.SYNCING);
    try {
      await pull();

      if (!firstPullDone) {
        firstPullDone = true;
        boot.origin = 'user';           // from here on, writes are real edits
        promoteWeak();                  // boot rewrites the server didn't override
      }

      await push();
      flushChanges();

      failures = 0;
      lastOk = Date.now();
      try { boot.raw.setItem(K_LASTOK, String(lastOk)); } catch (_) {}
      setState(pendingCount() ? STATE.SYNCING : STATE.SYNCED);
      if (pendingCount()) schedulePush(200);
      return true;
    } catch (err) {
      failures++;
      var offline = (typeof navigator !== 'undefined' && navigator.onLine === false) ||
                    /fetch|network|Failed to fetch/i.test(String(err && err.message || err));
      setState(offline ? STATE.OFFLINE : STATE.ERROR, String(err && (err.message || err.error_description) || err));
      scheduleRetry();
      return false;
    } finally {
      running = false;
      if (queued) { queued = false; schedulePush(50); }
    }
  }

  /* A boot rewrite the server had nothing to say about is simply this device's
   * state — send it. One that the server did overwrite was dropped during the
   * pull. That is the whole "don't let page start-up clobber another device"
   * rule, and it lives in exactly these two places. */
  function promoteWeak() {
    var any = false;
    for (var k in outbox) {
      if (!outbox[k].weak) continue;
      if (outbox[k].deleted) { delete outbox[k]; any = true; continue; } // never push a boot deletion
      outbox[k].weak = false;
      outbox[k].lamport = nextLamport();
      any = true;
    }
    if (any) saveOutbox();
  }

  var pushTimer = null;
  function schedulePush(ms) {
    if (!isCloud() || RESCUE) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushTimer = null; cycle('local-edit'); }, ms == null ? PUSH_DEBOUNCE : ms);
  }
  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    var wait = Math.min(60000, 2000 * Math.pow(2, Math.min(failures, 5)));
    wait = Math.round(wait * (0.8 + Math.random() * 0.4));   // jitter, so devices don't retry in lockstep
    retryTimer = setTimeout(function () { retryTimer = null; cycle('retry'); }, wait);
  }

  /* ============================================================
   * LAYER 6: REALTIME
   * ============================================================ */
  var rtUp = false, pollTimer = null;
  function startRealtime(uid) {
    try {
      sb.channel('sync-' + uid)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: TABLE, filter: 'user_id=eq.' + uid },
            function () { schedulePush(300); })
        .subscribe(function (st) { rtUp = (st === 'SUBSCRIBED'); repoll(); });
    } catch (_) { rtUp = false; repoll(); }
  }
  function repoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { cycle('poll'); }, rtUp ? POLL_MS_RT : POLL_MS);
  }

  /* ============================================================
   * MIGRATION — import the v2 whole-device row, once
   * ============================================================ */
  async function migrateV2() {
    if (lsGet(K_MIGRATED)) return;
    try {
      var r = await sb.from('app_state').select('data').eq('key', 'patron-device-snapshot').maybeSingle();
      var d = r && r.data && r.data.data;
      var incoming = {};
      if (d && d.v === 2 && d.keys) { for (var k in d.keys) if (d.keys[k].s != null) incoming[k] = d.keys[k].s; }
      else if (d && d.blob) { for (var k2 in d.blob) incoming[k2] = d.blob[k2]; }
      // Union, never replace: a key this device is missing gets filled in, a key
      // it already has is left alone and pushed up by the normal first-run seed.
      for (var kk in incoming) {
        if (_skip(kk)) continue;
        if (lsGet(kk) === null) {
          writeLocal(kk, incoming[kk]);
          outbox[kk] = { base: null, baseRev: 0, lamport: nextLamport(), deleted: false, weak: false, at: Date.now() };
          changedKeys.push(kk);
        }
      }
      saveOutbox();
    } catch (_) { /* old table gone or unreadable — nothing to migrate */ }
    try { boot.raw.setItem(K_MIGRATED, '1'); } catch (_) {}
  }

  /* ============================================================
   * START-UP
   * ============================================================ */
  async function start() {
    if (!connected) { setState(RESCUE ? STATE.RESCUE : STATE.LOCAL); return; }
    var s = await sb.auth.getSession();
    session = (s && s.data && s.data.session) || null;

    sb.auth.onAuthStateChange(function (_evt, sess) {
      var had = !!session;
      session = sess || null;
      if (session && !had) begin();
      else if (!session) setState(STATE.SIGNED_OUT);
    });

    if (!session) { setState(RESCUE ? STATE.RESCUE : STATE.SIGNED_OUT); return; }
    begin();
  }

  async function begin() {
    if (RESCUE) { setState(STATE.RESCUE); return; }
    seedFirstRun();
    await migrateV2();
    await cycle('start');
    startRealtime(session.user.id);

    window.addEventListener('online', function () { failures = 0; cycle('online'); });
    window.addEventListener('offline', function () { setState(STATE.OFFLINE); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cycle('focus'); });
    window.addEventListener('focus', function () { cycle('focus'); });
    // Last-gasp flush when the tab goes away.
    window.addEventListener('pagehide', function () { if (pendingCount()) cycle('pagehide'); });
  }

  // Keys first (pasted), otherwise this deploy's env vars via /api/config.
  (async function boot_() {
    if (_ovUrl && _ovKey) { connect(_ovUrl, _ovKey); }
    else {
      try {
        var r = await fetch('/api/config', { cache: 'no-store' });
        if (r.ok) {
          var cfg = await r.json();
          url = (cfg && cfg.url || '').trim(); key = (cfg && cfg.key || '').trim();
          connect(url, key);
        }
      } catch (_) {}
    }
    await start();
    emit('patrondb:ready', status());
  })();

  /* ============================================================
   * PUBLIC API
   * ============================================================ */

  // --- explicit intent. Pages don't have to use these (raw localStorage is
  // still tracked) but a page that does gets its writes classified correctly
  // even when they happen during start-up. ---
  function write(k, v) {
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    boot.as('user', function () { try { localStorage.setItem(k, s); } catch (_) {} });
  }
  function remove(k) {
    boot.as('user', function () { try { localStorage.removeItem(k); } catch (_) {} });
  }
  // A rewrite the page performs for itself (rolling to a new day, seeding a
  // default). Marked derived, so it can never overwrite another device.
  function derive(k, v) {
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    boot.as('boot', function () { try { localStorage.setItem(k, s); } catch (_) {} });
  }

  // --- compatibility with the old db.js surface (20 pages call these) ---
  function _local(k) { try { return JSON.parse(localStorage.getItem('patron_db_' + k) || 'null'); } catch (_) { return null; } }
  async function get(k) { return _local(k); }
  async function set(k, v) { write('patron_db_' + k, JSON.stringify(v)); }
  function subscribe(_k, cb) { return onChange(cb); }

  async function uploadImage(bucket, path, dataUrl, contentType) {
    if (!sb || !session) return null;
    try {
      var blob = await (await fetch(dataUrl)).blob();
      var up = await sb.storage.from(bucket).upload(path, blob, { contentType: contentType || 'image/jpeg', upsert: true });
      if (up.error) return null;
      var pu = sb.storage.from(bucket).getPublicUrl(path);
      return (pu && pu.data && pu.data.publicUrl) || null;
    } catch (_) { return null; }
  }
  async function deleteImage(bucket, path) {
    if (!sb || !session || !path) return;
    try { await sb.storage.from(bucket).remove([path]); } catch (_) {}
  }

  // --- manual controls ---
  async function syncNow() { failures = 0; return await cycle('manual'); }

  // Make the server match THIS device exactly. The escape hatch, not the norm.
  async function pushAll() {
    if (!isCloud()) return { ok: false, n: 0 };
    try {
      var r = await sb.from(TABLE).select('key,rev');
      if (r.error) throw r.error;
      var revs = {};
      (r.data || []).forEach(function (x) { revs[x.key] = x.rev; });

      var items = [], i, k;
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (_skip(k)) continue;
        items.push({ key: k, value: lsGet(k), deleted: false, base_rev: revs[k] || 0, lamport: nextLamport() });
        delete revs[k];
      }
      for (k in revs) items.push({ key: k, value: null, deleted: true, base_rev: revs[k], lamport: nextLamport() });

      for (i = 0; i < items.length; i += PUSH_BATCH) {
        var res = await sb.rpc('sync_push', { p_items: items.slice(i, i + PUSH_BATCH), p_device: deviceId });
        if (res.error) throw res.error;
        (res.data.accepted || []).forEach(function (a) {
          meta[a.key] = [a.rev, hash(lsGet(a.key)), a.lamport];
          agreed[a.key] = lsGet(a.key);
          delete outbox[a.key];
          if (a.seq > cursor) setCursor(a.seq);
        });
      }
      saveMeta(); saveOutbox();
      setState(STATE.SYNCED);
      return { ok: true, n: items.length };
    } catch (e) { setState(STATE.ERROR, String(e && e.message || e)); return { ok: false, n: 0 }; }
  }

  // Make THIS device match the server exactly.
  async function pullAll() {
    if (!isCloud()) return { ok: false, n: 0 };
    try {
      var r = await sb.from(TABLE).select('key,value,deleted,rev,lamport,device_id,seq');
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) return { ok: false, n: 0 };
      outbox = {}; saveOutbox();
      var hi = cursor;
      rows.forEach(function (row) {
        if (_skip(row.key)) return;
        writeLocal(row.key, row.deleted ? null : row.value);
        meta[row.key] = [row.rev, hash(row.deleted ? null : row.value), row.lamport || 0];
        agreed[row.key] = row.deleted ? null : row.value;
        if (row.seq > hi) hi = row.seq;
      });
      setCursor(hi); saveMeta();
      setState(STATE.SYNCED);
      return { ok: true, n: rows.length };
    } catch (e) { setState(STATE.ERROR, String(e && e.message || e)); return { ok: false, n: 0 }; }
  }

  return {
    // status + control
    status: status, syncNow: syncNow, onChange: onChange, isRescue: function () { return RESCUE; },
    // auth
    signInPassword: signInPassword, signUpPassword: signUpPassword,
    signIn: signIn, verifyCode: verifyCode, signOut: signOut,
    // explicit writes
    write: write, remove: remove, derive: derive,
    // compatibility
    isCloud: isCloud, cfgUrl: cfgUrl, cfgKey: cfgKey, get: get, set: set, subscribe: subscribe,
    uploadImage: uploadImage, deleteImage: deleteImage, pushAll: pushAll, pullAll: pullAll,
    // testing seam
    _internal: { cycle: cycle, outbox: function () { return outbox; }, meta: function () { return meta; },
                 cursor: function () { return cursor; }, connect: connect,
                 setSession: function (s) { session = s; }, begin: begin, STATE: STATE }
  };
})();
