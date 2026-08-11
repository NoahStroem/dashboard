/* ============================================================
 * db.js — DEPRECATED. Replaced by sync-boot.js + sync-merge.js + sync.js.
 *
 * Every page now loads the v3 engine instead:
 *
 *   <head>  <script src="sync-boot.js?v=1"></script>
 *   <body>  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *           <script src="sync-merge.js?v=1"></script>
 *           <script src="sync.js?v=1"></script>
 *           <script src="sync-ui.js?v=1"></script>
 *
 * This file only still exists so a page served from an old HTTP cache — one
 * whose HTML still points here — degrades to local-only instead of throwing on
 * PatronDB. It syncs nothing. See SYNC.md.
 * ============================================================ */
if (!window.PatronDB) {
  window.PatronDB = (function () {
    function local(k) { try { return JSON.parse(localStorage.getItem('patron_db_' + k) || 'null'); } catch (_) { return null; } }
    function noop() {}
    return {
      isCloud: function () { return false; },
      status: function () { return { state: 'local', pending: 0, lastSyncedAt: null, error: 'Loaded the retired db.js — reload the page to pick up sync.js.', email: null, rescue: false }; },
      cfgUrl: function () { return ''; },
      cfgKey: function () { return ''; },
      get: function (k) { return Promise.resolve(local(k)); },
      set: function (k, v) { try { localStorage.setItem('patron_db_' + k, JSON.stringify(v)); } catch (_) {} return Promise.resolve(); },
      write: function (k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) {} },
      remove: function (k) { try { localStorage.removeItem(k); } catch (_) {} },
      derive: function (k, v) { this.write(k, v); },
      subscribe: function () { return noop; },
      onChange: function () { return noop; },
      syncNow: function () { return Promise.resolve(false); },
      isRescue: function () { return false; },
      signIn: function () { return Promise.resolve({ ok: false, error: 'Reload the page.' }); },
      verifyCode: function () { return Promise.resolve({ ok: false, error: 'Reload the page.' }); },
      signOut: function () { return Promise.resolve(); },
      uploadImage: function () { return Promise.resolve(null); },
      deleteImage: function () { return Promise.resolve(); },
      pushAll: function () { return Promise.resolve({ ok: false, n: 0 }); },
      pullAll: function () { return Promise.resolve({ ok: false, n: 0 }); }
    };
  })();
}
