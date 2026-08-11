/* ============================================================
 * sync-boot.js — LAYER 1a: write instrumentation.
 *
 * Loads in <head>, BEFORE any page script, and does two things:
 *
 *   1. Snapshots localStorage as it was left by the previous session.
 *   2. Wraps Storage.prototype.setItem / removeItem so every later write is
 *      recorded with a timestamp and an ORIGIN.
 *
 * Why this file exists at all:
 *
 * A page rewrites storage while it boots — rolling a tile over to a new day,
 * clearing something stale, seeding defaults. That is not you editing anything,
 * but a sync engine that can only diff "what's in storage now" against "what I
 * last agreed with the server" cannot tell the difference. It sees the newest
 * change and pushes it. That is how opening the dashboard on a laptop that had
 * been closed for two days deleted two days of vitals typed on a phone.
 *
 * Guessing is the bug. So we stop guessing: a write that happens before the
 * first successful pull is tagged `boot` and can never overwrite a newer value
 * from another device. A write after that is tagged `user` and behaves normally.
 * The engine's own writes are tagged `engine` and are not local changes at all.
 *
 * Keep this as the first script on the page. It has no dependencies and does no
 * network I/O — it only needs to run before anything else can touch storage.
 * ============================================================ */
(function () {
  if (window.__syncBoot) return;

  // ---- 1. what the previous session left behind ----
  var baseline = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k != null) baseline[k] = localStorage.getItem(k);
    }
  } catch (_) {}

  // ---- 2. record every write, with who caused it ----
  var writes = Object.create(null);   // key -> { t, origin }
  var listeners = [];
  var api = {
    baseline: baseline,
    writes: writes,
    // 'boot'   — page start-up, before the first pull landed. Weak: never wins.
    // 'user'   — a real edit made while the app is live. Strong.
    // 'engine' — the sync engine writing an adopted value. Not a local change.
    origin: 'boot',
    startedAt: Date.now(),
    onWrite: function (fn) { listeners.push(fn); },
    // Run fn with a given origin, then restore. Used by the engine around adopt.
    as: function (origin, fn) {
      var prev = api.origin;
      api.origin = origin;
      try { return fn(); } finally { api.origin = prev; }
    },
    // Un-wrapped originals, so the engine can write without re-entering itself.
    // Always present: if the wrapping below can't happen we fall back to the
    // plain calls rather than leaving the engine with nothing to write through.
    raw: {
      setItem: function (k, v) { localStorage.setItem(k, v); },
      removeItem: function (k) { localStorage.removeItem(k); }
    }
  };

  var proto = window.Storage && window.Storage.prototype;
  if (proto) {
    var _set = proto.setItem, _remove = proto.removeItem, _clear = proto.clear;
    api.raw = {
      setItem: function (k, v) { _set.call(localStorage, k, v); },
      removeItem: function (k) { _remove.call(localStorage, k); }
    };

    function note(k) {
      writes[k] = { t: Date.now(), origin: api.origin };
      for (var j = 0; j < listeners.length; j++) { try { listeners[j](k, api.origin); } catch (_) {} }
    }
    // `this === localStorage` matters: sessionStorage shares the prototype and
    // has nothing to do with sync.
    proto.setItem = function (k, v) {
      _set.call(this, k, v);
      if (this === window.localStorage) note(k);
    };
    proto.removeItem = function (k) {
      _remove.call(this, k);
      if (this === window.localStorage) note(k);
    };
    proto.clear = function () {
      var keys = [];
      if (this === window.localStorage) { for (var n = 0; n < this.length; n++) keys.push(this.key(n)); }
      _clear.call(this);
      for (var m = 0; m < keys.length; m++) note(keys[m]);
    };
  }

  window.__syncBoot = api;
})();
