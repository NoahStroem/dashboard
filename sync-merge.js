/* ============================================================
 * sync-merge.js — LAYER 5: conflict resolution.
 *
 * Pure functions, no I/O, no dependencies. The engine hands this file three
 * versions of one key and gets back the value to keep:
 *
 *   base   — what this device and the server last agreed on
 *   local  — what this device has now
 *   remote — what the server has now
 *
 * Three-way, not last-write-wins. LWW is only the fallback for values that
 * genuinely cannot be merged (a number, a string, a setting). For the shapes
 * this app actually stores — a map of day → reading, a list of logged entries —
 * "newest edit wins" throws away real data: log water on your phone and food on
 * your laptop in the same minute and one of them loses. Merging keeps both.
 *
 * Convergence rule: every decision here must be symmetric. Device A merges
 * (local=A, remote=B); device B merges (local=B, remote=A). Both must land on
 * the same bytes or they will push edits at each other forever. That is why
 * ties break on (lamport, deviceId) — which is the same pair viewed from either
 * side — and why structurally merged output is emitted with sorted keys.
 * ============================================================ */
(function (root) {
  'use strict';

  var MAX_DEPTH = 8;

  /* ---------- helpers ---------- */

  function parse(s) {
    if (s === null || s === undefined) return undefined;
    try { return JSON.parse(s); } catch (_) { return undefined; }
  }
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  // Canonical form: sorted keys, so equality and output are order-independent.
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (isPlainObject(v)) {
      var out = {}, keys = Object.keys(v).sort();
      for (var i = 0; i < keys.length; i++) out[keys[i]] = canon(v[keys[i]]);
      return out;
    }
    return v;
  }
  function eq(a, b) {
    if (a === b) return true;
    try { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); } catch (_) { return false; }
  }
  function has(o, k) { return isPlainObject(o) && Object.prototype.hasOwnProperty.call(o, k); }

  // Which side wins when nothing structural can decide it. Symmetric: both
  // devices compute the same answer from the same two (lamport, device) pairs.
  function winner(ctx) {
    var ll = (ctx && ctx.localLamport) || 0, rl = (ctx && ctx.remoteLamport) || 0;
    if (ll !== rl) return ll > rl ? 'local' : 'remote';
    var ld = String((ctx && ctx.localDevice) || ''), rd = String((ctx && ctx.remoteDevice) || '');
    if (ld !== rd) return ld > rd ? 'local' : 'remote';
    return 'remote'; // same device, same clock: nothing to choose, take the server's
  }

  // Entries that carry their own timestamp decide themselves — a reading saved
  // at 08:12 beats the same day's reading saved at 07:40 regardless of which
  // device pushed first.
  function entryTime(v) {
    if (!isPlainObject(v)) return null;
    var t = v.ts != null ? v.ts : v.updatedAt != null ? v.updatedAt : v.savedAt != null ? v.savedAt : null;
    if (t == null) return null;
    var n = typeof t === 'number' ? t : Date.parse(t);
    return isFinite(n) ? n : null;
  }

  /* ---------- value-level three-way merge ---------- */

  function mergeValue(base, local, remote, ctx, depth) {
    if (eq(local, remote)) return local;
    if (base !== undefined && eq(base, local)) return remote;  // only they changed it
    if (base !== undefined && eq(base, remote)) return local;  // only we changed it

    // Both changed. Try to go deeper before giving up and picking a side.
    if (depth < MAX_DEPTH) {
      if (isPlainObject(local) && isPlainObject(remote)) {
        return mergeObject(isPlainObject(base) ? base : {}, local, remote, ctx, depth + 1);
      }
      if (Array.isArray(local) && Array.isArray(remote)) {
        var merged = mergeList(Array.isArray(base) ? base : [], local, remote, ctx, depth + 1);
        if (merged) return merged;
      }
    }
    var lt = entryTime(local), rt = entryTime(remote);
    if (lt != null && rt != null && lt !== rt) return lt > rt ? local : remote;
    return winner(ctx) === 'local' ? local : remote;
  }

  /* ---------- objects: key-by-key union ----------
   * Covers the map shapes this app stores: { '2026-08-10': {...} } day logs,
   * settings objects, per-page state. A key touched on one side and untouched
   * on the other simply carries over — no conflict at all. */
  function mergeObject(base, local, remote, ctx, depth) {
    var out = {}, seen = {}, keys = [], k, i;
    for (k in local) if (has(local, k) && !seen[k]) { seen[k] = 1; keys.push(k); }
    for (k in remote) if (has(remote, k) && !seen[k]) { seen[k] = 1; keys.push(k); }

    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      var inL = has(local, k), inR = has(remote, k), inB = has(base, k);
      var lv = local[k], rv = remote[k], bv = base[k];

      if (inL && inR) {
        out[k] = mergeValue(inB ? bv : undefined, lv, rv, ctx, depth);
      } else if (inL) {
        // Gone on their side. If we never touched it, they deleted it — respect
        // that. If we changed it, an edit outranks a delete: keep the data.
        if (!(inB && eq(bv, lv))) out[k] = lv;
      } else {
        if (!(inB && eq(bv, rv))) out[k] = rv;
      }
    }
    return out;
  }

  /* ---------- lists: union by identity ----------
   * Only for the "log of entries" shape — every element an object carrying an
   * id or a timestamp. Anything else (an ordered list where position is the
   * meaning) returns null and falls back to picking a side, because silently
   * reordering it would be worse than losing one edit.
   *
   * Merged lists come back in a normalised order (by ts, else by id) so both
   * devices produce identical bytes. */
  function listIdentity(arr) {
    if (!arr.length) return null;
    var fields = ['id', 'uid', 'dateKey', 'ts'], f, i, j;
    for (i = 0; i < fields.length; i++) {
      f = fields[i];
      var all = true;
      for (j = 0; j < arr.length; j++) {
        if (!isPlainObject(arr[j]) || arr[j][f] === undefined || arr[j][f] === null) { all = false; break; }
      }
      if (all) return f;
    }
    return null;
  }
  function mergeList(base, local, remote, ctx, depth) {
    var pool = local.concat(remote);
    if (!pool.length) return [];
    var idf = listIdentity(pool);
    if (!idf) return null;                      // not an entry log — caller picks a side

    function index(arr) {
      var m = {};
      for (var i = 0; i < arr.length; i++) m[String(arr[i][idf])] = arr[i];
      return m;
    }
    var L = index(local), R = index(remote), B = index(Array.isArray(base) ? base : []);
    var ids = Object.keys(L);
    for (var k in R) if (!Object.prototype.hasOwnProperty.call(L, k)) ids.push(k);

    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], inL = has(L, id), inR = has(R, id), inB = has(B, id);
      if (inL && inR) out.push(mergeValue(inB ? B[id] : undefined, L[id], R[id], ctx, depth));
      else if (inL) { if (!(inB && eq(B[id], L[id]))) out.push(L[id]); }   // deleted remotely
      else { if (!(inB && eq(B[id], R[id]))) out.push(R[id]); }            // deleted locally
    }

    var allTs = out.every(function (e) { return entryTime(e) != null; });
    out.sort(function (a, b) {
      if (allTs) { var d = entryTime(a) - entryTime(b); if (d) return d; }
      var x = String(a[idf]), y = String(b[idf]);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return out;
  }

  /* ---------- per-key overrides ---------- */
  var custom = [];
  function strategy(match, fn) { custom.push({ match: match, fn: fn }); }
  function lookup(key) {
    for (var i = 0; i < custom.length; i++) {
      var m = custom[i].match;
      if (typeof m === 'string' ? m === key : m.test(key)) return custom[i].fn;
    }
    return null;
  }

  /* ---------- the entry point the engine calls ----------
   * Takes and returns raw localStorage strings. Returns an object:
   *   { value, how }  — how is 'identical' | 'local' | 'remote' | 'merged'
   * so the UI and the logs can say what actually happened. */
  function merge(key, baseStr, localStr, remoteStr, ctx) {
    ctx = ctx || {};
    if (localStr === remoteStr) return { value: localStr, how: 'identical' };
    if (baseStr !== null && baseStr !== undefined) {
      if (baseStr === localStr) return { value: remoteStr, how: 'remote' };
      if (baseStr === remoteStr) return { value: localStr, how: 'local' };
    }

    var fn = lookup(key);
    if (fn) {
      try {
        var v = fn(baseStr, localStr, remoteStr, ctx);
        if (typeof v === 'string') return { value: v, how: 'merged' };
      } catch (_) {}
    }

    // A deletion on one side is not mergeable structurally. An edit outranks a
    // delete: whoever still has data keeps it. Losing a deletion is an
    // annoyance; losing two days of entries is not.
    if (localStr === null) return { value: remoteStr, how: 'remote' };
    if (remoteStr === null) return { value: localStr, how: 'local' };

    var b = parse(baseStr), l = parse(localStr), r = parse(remoteStr);
    var mergeable = (isPlainObject(l) && isPlainObject(r)) || (Array.isArray(l) && Array.isArray(r));
    if (!mergeable) {
      var lt = entryTime(l), rt = entryTime(r);
      if (lt != null && rt != null && lt !== rt) return { value: lt > rt ? localStr : remoteStr, how: lt > rt ? 'local' : 'remote' };
      var w = winner(ctx);
      return { value: w === 'local' ? localStr : remoteStr, how: w };
    }

    var merged = mergeValue(b, l, r, ctx, 0);
    if (eq(merged, l)) return { value: localStr, how: 'local' };
    if (eq(merged, r)) return { value: remoteStr, how: 'remote' };
    try {
      return { value: JSON.stringify(canon(merged)), how: 'merged' };
    } catch (_) {
      var w2 = winner(ctx);
      return { value: w2 === 'local' ? localStr : remoteStr, how: w2 };
    }
  }

  var API = { merge: merge, strategy: strategy, _canon: canon, _eq: eq };
  root.PatronMerge = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
