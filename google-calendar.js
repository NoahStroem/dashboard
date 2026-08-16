/* ============================================================
 * google-calendar.js — Google Calendar connection (STEP 1: auth only).
 *
 * Owns the OAuth lifecycle and nothing else. Fetching events, mapping them
 * into the calendar model and merging them into "Coming up" are later steps;
 * this file deliberately stops at "we hold a valid access token".
 *
 * ---- Why the token model, and what it costs ----
 *
 * This is a static site with no session backend, so authorization uses Google
 * Identity Services' TOKEN model (google.accounts.oauth2.initTokenClient) —
 * the browser gets an access token directly. The consequences are not
 * incidental, they shape the whole UI:
 *
 *   - No refresh token is ever issued. There is nothing to store, and nothing
 *     to leak.
 *   - Access tokens last about an hour and CANNOT be renewed silently.
 *     Google's guidance is explicit: after expiry the app must handle the API
 *     error and request a new token from a user gesture.
 *   - So "reconnect" is a normal, expected state — not an error. Leave the
 *     dashboard open over lunch and the next fetch will need a click. The UI
 *     says so plainly rather than pretending something broke.
 *
 * ---- Why the token is never persisted ----
 *
 * Every localStorage key in this suite rides the cross-device sync engine.
 * Writing an access token to localStorage would push a live OAuth grant to
 * every other device on the account. It lives in a closure variable, dies with
 * the tab, and that costs nothing because it could not have been refreshed
 * anyway.
 *
 * What IS persisted (under the `gcal_` prefix, which sync.js skips) is only
 * the fact that this device has linked before — so the button can say
 * "Reconnect" instead of "Connect".
 *
 * ---- Structured for write access later ----
 *
 * Scopes live in SCOPES and the requested set in `requested`. Granting write
 * access later means pushing one more scope into that array and shipping the
 * UI for it; canWrite() already reports what Google actually granted, rather
 * than what we asked for.
 * ============================================================ */
(function (global) {
  'use strict';

  var GIS_SRC = 'https://accounts.google.com/gsi/client';

  var SCOPES = {
    read:  'https://www.googleapis.com/auth/calendar.readonly',
    write: 'https://www.googleapis.com/auth/calendar.events'
  };
  var requested = [SCOPES.read];

  var CONN_KEY = 'gcal_conn_v1';        // skipped by sync.js — per device
  var CLIENT_ID_KEY = 'gcal_client_id'; // localhost fallback, also skipped

  /* ---- in-memory only ---- */
  var accessToken = null;
  var expiresAt = 0;
  var grantedScopes = [];
  var tokenClient = null;
  var clientId = '';
  var clientIdSource = '';              // 'config' | 'local' | ''
  var state = 'loading';                // see status()
  var lastError = '';
  var initStarted = false;

  var listeners = [];
  function emit() {
    var s = status();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](s); } catch (_) {}
    }
  }
  function setState(next, err) {
    state = next;
    lastError = err || '';
    emit();
  }

  /* ---- persisted, per-device ---- */
  function conn() {
    try {
      var raw = global.localStorage.getItem(CONN_KEY);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === 'object') ? o : {};
    } catch (_) { return {}; }
  }
  function saveConn(patch) {
    var c = conn();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) c[k] = patch[k];
    try { global.localStorage.setItem(CONN_KEY, JSON.stringify(c)); } catch (_) {}
    return c;
  }

  /* ============================================================
   * Client ID resolution
   *
   * /api/config on a real deploy; a pasted value on localhost, where that
   * endpoint does not exist (python3 -m http.server returns 404 for it).
   * Never a literal in committed source.
   * ============================================================ */
  function localClientId() {
    try { return (global.localStorage.getItem(CLIENT_ID_KEY) || '').trim(); } catch (_) { return ''; }
  }

  function resolveClientId() {
    var local = localClientId();
    if (local) { clientId = local; clientIdSource = 'local'; return Promise.resolve(local); }

    return fetch('/api/config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        var id = (cfg && cfg.googleClientId ? String(cfg.googleClientId) : '').trim();
        if (id) { clientId = id; clientIdSource = 'config'; }
        return id;
      })
      .catch(function () { return ''; });   // offline, 404 on localhost, whatever
  }

  /* Is the library actually usable right now? Checked live rather than cached:
   * a "loaded" flag can outlive the thing it describes. */
  function gisAvailable() {
    return !!(global.google && global.google.accounts && global.google.accounts.oauth2);
  }

  /* ---- Load the GIS library. Failure is survivable: the dashboard works
   *      without Google, so this rejects quietly into an error state. ---- */
  function loadGis() {
    if (gisAvailable()) return Promise.resolve(true);

    return new Promise(function (resolve, reject) {
      /* A blocked script can fire `load` and still never define window.google —
       * content blockers routinely answer this URL with an empty 200. Treating
       * `load` as success would then hand a TypeError to the user instead of an
       * explanation, so the global is what gets checked, not the event. */
      function settle() {
        if (gisAvailable()) resolve(true);
        else reject(new Error('Google Identity Services loaded but did not start — a browser extension or content blocker may be stripping it.'));
      }
      function failed() { reject(new Error('Could not load Google Identity Services. Check your connection and try again.')); }

      var existing = document.querySelector('script[data-gis]');
      if (existing) {
        existing.addEventListener('load', settle);
        existing.addEventListener('error', failed);
        return;
      }
      var s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute('data-gis', '1');
      s.onload = settle;
      s.onerror = failed;
      document.head.appendChild(s);
    });
  }

  function buildTokenClient() {
    if (!gisAvailable()) throw new Error('Google Identity Services is not available.');
    tokenClient = global.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: requested.join(' '),
      callback: onToken,
      // Fires for problems outside the OAuth response itself — popup blocked,
      // popup closed by the user, network failure during the flow.
      error_callback: function (err) {
        var type = err && err.type ? err.type : '';
        if (type === 'popup_closed' || type === 'popup_failed_to_open') {
          setState(conn().linked ? 'disconnected' : 'disconnected',
                   type === 'popup_failed_to_open'
                     ? 'The Google popup was blocked. Allow popups for this site and try again.'
                     : '');
          return;
        }
        setState('error', (err && err.message) || 'Authorization failed.');
      }
    });
  }

  function onToken(resp) {
    if (!resp || resp.error) {
      setState('error', (resp && (resp.error_description || resp.error)) || 'Authorization failed.');
      return;
    }
    accessToken = resp.access_token || null;
    // expires_in is seconds. Retire the token 60s early so a fetch can't start
    // against a token that expires mid-flight.
    var ttl = Number(resp.expires_in);
    expiresAt = Date.now() + (isFinite(ttl) ? ttl : 3600) * 1000 - 60000;
    grantedScopes = String(resp.scope || '').split(/\s+/).filter(Boolean);

    if (!hasScope(SCOPES.read)) {
      accessToken = null;
      setState('error', 'Read access to your calendar was not granted.');
      return;
    }
    saveConn({ linked: true, lastConnectedAt: Date.now(), scopes: grantedScopes });
    setState('connected');
  }

  function hasScope(scope) { return grantedScopes.indexOf(scope) >= 0; }

  /* ============================================================
   * STEP 5 — multiple calendars.
   *
   * Which calendars to pull is a real preference — something you chose — so
   * unlike the token and the cache it is NOT under `gcal_` and DOES sync. Pick
   * your calendars on the laptop and the phone honours it, while each device
   * still authorises separately.
   * ============================================================ */

  var PREFS_KEY = 'calendar_google_prefs_v1';   // synced on purpose
  var PREFS_SCHEMA = 1;

  function prefs() {
    try {
      var o = JSON.parse(global.localStorage.getItem(PREFS_KEY) || 'null');
      if (o && typeof o === 'object' && Array.isArray(o.calendarIds)) return o;
    } catch (_) {}
    return { v: PREFS_SCHEMA, calendarIds: null };   // null = "not chosen yet"
  }

  /* Nothing chosen yet means the primary calendar, decided at READ time rather
   * than written into storage on first load — seeding a default during boot is
   * the exact move that makes a start-up write look like a real edit. */
  function selectedCalendars() {
    var ids = prefs().calendarIds;
    return (ids && ids.length) ? ids.slice() : ['primary'];
  }

  function setSelectedCalendars(ids) {
    var clean = [];
    for (var i = 0; i < (ids || []).length; i++) {
      var id = String(ids[i] || '').trim();
      if (id && clean.indexOf(id) === -1) clean.push(id);
    }
    var payload = JSON.stringify({ v: PREFS_SCHEMA, calendarIds: clean });
    try {
      if (global.PatronDB && global.PatronDB.write) global.PatronDB.write(PREFS_KEY, payload);
      else global.localStorage.setItem(PREFS_KEY, payload);
    } catch (_) {}
    emit();
    return clean;
  }

  /* The calendars on your list. calendar.readonly already authorises this —
   * no extra scope, so no second consent screen. */
  function listCalendars() {
    return apiGet('/users/me/calendarList', { maxResults: 250, minAccessRole: 'reader' })
      .then(function (body) {
        var items = (body && body.items) || [];
        var out = [];
        for (var i = 0; i < items.length; i++) {
          var c = items[i];
          if (!c || !c.id || c.deleted) continue;
          out.push({
            id: c.id,
            summary: c.summary || c.id,
            primary: !!c.primary,
            accessRole: c.accessRole || '',
            backgroundColor: c.backgroundColor || null
          });
        }
        /* Primary first, then alphabetical — a stable order so the toggle list
         * does not reshuffle between syncs. */
        out.sort(function (a, b) {
          if (a.primary !== b.primary) return a.primary ? -1 : 1;
          return a.summary.toLowerCase() < b.summary.toLowerCase() ? -1 : 1;
        });
        return out;
      });
  }

  /* ---- Cross-calendar de-duplication ----
   *
   * The same meeting sitting on two of your calendars arrives twice with two
   * different event ids, so id alone will not collapse it. iCalUID will —
   * but iCalUID ALONE is a trap: the Events reference states that "in recurring
   * events, all occurrences of one event have different ids while they all
   * share the same iCalUIDs". Deduping on it would fold an entire weekly
   * standup into a single row.
   *
   * So the key is the UID plus the occurrence: originalStartTime, which the
   * docs describe as uniquely identifying an instance within its series even
   * when that instance has been moved. */
  function dedupeKey(g) {
    if (!g) return '';
    if (!g.iCalUID) return 'id:' + g.id;
    var ost = g.originalStartTime && (g.originalStartTime.dateTime || g.originalStartTime.date);
    var st = g.start && (g.start.dateTime || g.start.date);
    return 'uid:' + g.iCalUID + '|' + (ost || st || '');
  }

  /* Map several calendars' worth of raw events into one de-duplicated list. */
  function mapAll(results) {
    var seen = {}, out = [];
    for (var i = 0; i < (results || []).length; i++) {
      var r = results[i] || {};
      var items = r.items || [];
      for (var j = 0; j < items.length; j++) {
        var raw = items[j];
        var k = dedupeKey(raw);
        if (k && seen[k]) continue;
        var e = mapGoogleEvent(raw, r.calendarId);
        if (!e) continue;
        if (k) seen[k] = true;
        out.push(e);
      }
    }
    return out;
  }

  /* Fetch every selected calendar and refresh the cache.
   *
   * Calendars are fetched one at a time and a failure on one does not sink the
   * rest: a calendar you lost access to should cost you that calendar, not the
   * whole sync. An auth failure is the exception — it will fail identically for
   * every calendar, so it stops immediately. */
  function syncAll(opts) {
    opts = opts || {};
    var ids = selectedCalendars();
    var results = [], errors = [];
    var fatal = null;

    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        if (fatal) return;
        return listEvents({ calendarId: id, days: opts.days == null ? 30 : opts.days, now: opts.now })
          .then(function (r) { results.push(r); })
          .catch(function (e) {
            if (e && e.kind === 'auth') { fatal = e; return; }
            errors.push({ calendarId: id, kind: (e && e.kind) || 'unknown', message: (e && e.message) || 'Failed.' });
          });
      });
    });

    return chain.then(function () {
      if (fatal) throw fatal;
      var mapped = mapAll(results);
      cacheEvents(mapped, {
        timeMin: results.length ? results[0].timeMin : null,
        timeMax: results.length ? results[0].timeMax : null,
        calendarIds: ids
      });
      return { events: mapped, errors: errors, calendarIds: ids,
               truncated: results.some(function (r) { return r.truncated; }) };
    });
  }

  /* ============================================================
   * STEP 4 — the cache that Coming up reads from.
   *
   * Mapped events are parked under `gcal_cache_v1`, which sync.js skips. Three
   * reasons, and the first is the one that matters:
   *
   *   1. This is DERIVED data. Google is the source of truth, so replicating a
   *      mirror of it through a sync engine built for hand-typed entries is
   *      pure cost — and it gets written moments after page load, which is the
   *      one shape of write that engine cannot tell from a real edit.
   *   2. Local events live in calendar_events_v1 and are never touched here.
   *      Nothing a sync does can lose them, because the writer never opens
   *      that key.
   *   3. It lets the hub tile show Google events without doing its own OAuth:
   *      calendar.html connects and fills the cache; index.html only reads it.
   * ============================================================ */

  var CACHE_KEY = 'gcal_cache_v1';
  var CACHE_SCHEMA = 1;

  function cacheEvents(events, meta) {
    meta = meta || {};
    var payload = {
      v: CACHE_SCHEMA,
      fetchedAt: Date.now(),
      timeMin: meta.timeMin || null,
      timeMax: meta.timeMax || null,
      calendarIds: meta.calendarIds || [meta.calendarId || 'primary'],
      items: events || []
    };
    try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (_) {}
    return payload;
  }

  /* Read the cache. Safe to call anywhere — no auth, no network, no GIS. A
   * missing, corrupt or foreign-schema cache reads as "no Google events",
   * which is exactly how the page behaves when Google is disconnected. */
  function cache() {
    var raw = null;
    try { raw = global.localStorage.getItem(CACHE_KEY); } catch (_) { return null; }
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
      if (o.v !== CACHE_SCHEMA) return null;
      return o;
    } catch (_) { return null; }
  }

  /* The mirrored events, re-normalised through the model so a hand-edited or
   * half-written cache cannot put a malformed record into the feed. */
  function cachedEvents() {
    var c = cache();
    if (!c) return [];
    var M = global.CalendarModel;
    var out = [];
    for (var i = 0; i < c.items.length; i++) {
      var e = M ? M.normalize(c.items[i]) : c.items[i];
      if (e && e.id) out.push(e);
    }
    return out;
  }

  function cacheInfo() {
    var c = cache();
    return c ? { fetchedAt: c.fetchedAt, count: c.items.length,
                 timeMin: c.timeMin, timeMax: c.timeMax, calendarIds: c.calendarIds } : null;
  }

  function clearCache() {
    try { global.localStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  /* ============================================================
   * Public API
   * ============================================================ */

  function init() {
    if (initStarted) return;
    initStarted = true;
    setState('loading');

    resolveClientId().then(function (id) {
      if (!id) { setState('unconfigured'); return; }
      return loadGis().then(function () {
        buildTokenClient();
        // A previous link tells us nothing about right now: the token died
        // with the last tab. The button says "Reconnect"; the state is honest.
        setState('disconnected');
      });
    }).catch(function (e) {
      setState('error', (e && e.message) || 'Google Calendar could not start.');
    });
  }

  /* MUST be called from a user gesture — Google requires it, and there is no
   * silent path. `prompt: ''` skips the consent screen when this browser has
   * already granted the scopes; if that turns out to need consent after all,
   * the error_callback path lets the user press the button again. */
  function connect(opts) {
    opts = opts || {};
    if (state === 'unconfigured') { setState('unconfigured', 'Add your Google client ID first.'); return; }
    if (!tokenClient) { setState('error', 'Google Identity Services is not ready yet.'); return; }
    setState('connecting');
    try {
      tokenClient.requestAccessToken(
        opts.forceConsent ? { prompt: 'consent' } : (conn().linked ? { prompt: '' } : {})
      );
    } catch (e) {
      setState('error', (e && e.message) || 'Could not start the Google sign-in.');
    }
  }

  function disconnect() {
    var t = accessToken;
    accessToken = null;
    expiresAt = 0;
    grantedScopes = [];
    saveConn({ linked: false, disconnectedAt: Date.now() });
    /* Disconnecting means "stop showing me my Google calendar", so the mirror
     * goes too. Note that an EXPIRED token does not do this: the events you
     * already have are still true, and blanking the list would punish you for
     * leaving a tab open. See handleAuthFailure. */
    clearCache();
    // Revoking is best-effort: the local state is already cleared, so a failed
    // revoke leaves the user disconnected here regardless.
    try {
      if (t && global.google && global.google.accounts && global.google.accounts.oauth2) {
        global.google.accounts.oauth2.revoke(t, function () {});
      }
    } catch (_) {}
    setState('disconnected');
  }

  /* The token for API calls, or null when there isn't a usable one. Callers
   * must treat null as "ask the user to reconnect", never as an error. */
  function getToken() {
    if (!accessToken) return null;
    if (Date.now() >= expiresAt) { accessToken = null; setState('disconnected', 'Your Google session expired.'); return null; }
    return accessToken;
  }

  /* Step 2 routes 401/403 from the Calendar API here: the grant is gone or was
   * revoked from Google's side, so drop everything and ask for a reconnect
   * rather than retrying into a wall. */
  function handleAuthFailure(httpStatus) {
    accessToken = null;
    expiresAt = 0;
    setState('disconnected', httpStatus === 403
      ? 'Google refused the request — reconnect to grant access again.'
      : 'Your Google session expired.');
  }

  function setClientId(id) {
    id = String(id || '').trim();
    try {
      if (id) global.localStorage.setItem(CLIENT_ID_KEY, id);
      else global.localStorage.removeItem(CLIENT_ID_KEY);
    } catch (_) {}
    // Re-run startup with the new value.
    initStarted = false;
    tokenClient = null;
    clientId = '';
    clientIdSource = '';
    init();
  }

  function status() {
    var c = conn();
    return {
      state: state,                 // loading|unconfigured|disconnected|connecting|connected|error
      connected: state === 'connected',
      linked: !!c.linked,           // has this device ever connected?
      error: lastError,
      clientIdSource: clientIdSource,
      hasClientId: !!clientId,
      lastConnectedAt: c.lastConnectedAt || null,
      lastSyncAt: c.lastSyncAt || null,   // set by step 2
      scopes: grantedScopes.slice(),
      canWrite: canWrite()
    };
  }

  function canWrite() { return hasScope(SCOPES.write); }

  /* ============================================================
   * STEP 2 — reading events out of the Calendar API.
   *
   * Plain fetch with a Bearer header. The gapi client library is deliberately
   * not loaded: it is a second large dependency that would buy us a wrapper
   * around one GET.
   *
   * Windowed, not incremental. syncToken cannot be combined with timeMin,
   * timeMax or orderBy — the events.list reference lists them as invalid
   * alongside a sync token — so incremental sync would mean mirroring the whole
   * calendar locally and sorting client-side. For a view that shows 30 days,
   * a bounded query is both smaller and simpler.
   * ============================================================ */

  var API_BASE = 'https://www.googleapis.com/calendar/v3';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* RFC3339 with a real local offset, which is what timeMin/timeMax require.
   * Not toISOString(): that is UTC, and sending UTC bounds for a window the
   * user thinks of in local time shifts the edges of the window by the offset. */
  function rfc3339(d) {
    var off = -d.getTimezoneOffset();          // minutes east of UTC
    var sign = off >= 0 ? '+' : '-';
    var abs = Math.abs(off);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
      + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  /* A failure the UI can act on, rather than a bare status code.
   * The distinction that matters most is 403-because-revoked (reconnect) versus
   * 403-because-the-API-was-never-enabled (a Cloud Console problem no amount of
   * reconnecting will fix). Conflating them sends you round a loop that cannot
   * succeed. */
  function classifyError(httpStatus, body) {
    var reason = '', message = '';
    try {
      var err = body && body.error;
      if (err) {
        message = err.message || '';
        var d = err.errors && err.errors[0];
        reason = (d && d.reason) || err.status || '';
      }
    } catch (_) {}

    if (httpStatus === 401) return { kind: 'auth', status: 401, message: 'Your Google session expired.' };

    if (httpStatus === 403) {
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used in project|is disabled/i.test(message)) {
        return { kind: 'api-disabled', status: 403,
                 message: 'The Google Calendar API is not enabled for this Cloud project. Enable it under APIs & Services → Library, then try again.' };
      }
      if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(reason)) {
        return { kind: 'rate-limit', status: 403, message: 'Google is rate-limiting this app. Try again shortly.' };
      }
      return { kind: 'auth', status: 403, message: 'Google refused the request — reconnect to grant access again.' };
    }

    if (httpStatus === 404) return { kind: 'not-found', status: 404, message: 'That calendar no longer exists.' };
    if (httpStatus === 429) return { kind: 'rate-limit', status: 429, message: 'Google is rate-limiting this app. Try again shortly.' };
    if (httpStatus >= 500) return { kind: 'server', status: httpStatus, message: 'Google Calendar is having trouble. This is temporary.' };
    return { kind: 'unknown', status: httpStatus, message: message || ('Request failed (' + httpStatus + ').') };
  }

  /* One authenticated GET. Rejects with a classified error; auth failures also
   * clear local state so the UI flips to "reconnect" on its own. */
  function apiGet(path, params) {
    var token = getToken();
    if (!token) return Promise.reject({ kind: 'auth', status: 0, message: 'Not connected to Google Calendar.' });

    var qs = Object.keys(params || {})
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');

    return fetch(API_BASE + path + (qs ? '?' + qs : ''), {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (res) {
      if (res.ok) return res.json();
      return res.json().catch(function () { return null; }).then(function (body) {
        var e = classifyError(res.status, body);
        if (e.kind === 'auth') handleAuthFailure(e.status);
        throw e;
      });
    }, function () {
      // Network-level failure: offline, DNS, blocked. Never fatal — the caller
      // keeps whatever it already had.
      throw { kind: 'network', status: 0, message: 'Could not reach Google. You may be offline.' };
    });
  }

  /* Every event in [timeMin, timeMax] for one calendar, pages followed.
   *
   * singleEvents=true expands recurring events into concrete instances, and
   * orderBy=startTime is only legal alongside it — which is exactly the shape
   * this dashboard wants, since it shows occurrences rather than rules. */
  function listEvents(opts) {
    opts = opts || {};
    var calendarId = opts.calendarId || 'primary';
    var now = opts.now || new Date();
    var days = opts.days == null ? 30 : opts.days;

    var timeMin = opts.timeMin || rfc3339(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59);
    var timeMax = opts.timeMax || rfc3339(end);

    var out = [];
    var MAX_PAGES = 10;     // 2500 events in a 30-day window means something is wrong

    function page(pageToken, n) {
      return apiGet('/calendars/' + encodeURIComponent(calendarId) + '/events', {
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: 250,
        pageToken: pageToken
      }).then(function (body) {
        var items = (body && body.items) || [];
        for (var i = 0; i < items.length; i++) out.push(items[i]);
        var next = body && body.nextPageToken;
        if (next && n < MAX_PAGES) return page(next, n + 1);
        return { calendarId: calendarId, items: out, timeMin: timeMin, timeMax: timeMax,
                 timeZone: (body && body.timeZone) || null, truncated: !!(next && n >= MAX_PAGES) };
      });
    }

    return page(null, 1).then(function (result) {
      saveConn({ lastSyncAt: Date.now() });
      emit();
      return result;
    });
  }

  /* ============================================================
   * STEP 3 — Google's event shape → the dashboard's Event.
   *
   * This adapter lives here, not in calendar-model.js, on purpose: the model
   * stays provider-agnostic, and supporting another calendar provider later
   * means writing another adapter rather than teaching the model a second
   * vocabulary.
   *
   * Two shapes of the same field, and both are traps:
   *
   *   timed    start.dateTime = '2026-08-20T09:00:00+02:00'  (RFC3339, offset)
   *   all-day  start.date     = '2026-08-20'                 (no time, no zone)
   *
   * A timed event is an instant, so it is parsed and re-rendered in the
   * viewer's local wall clock — 09:00 in Copenhagen shows as 08:00 in London,
   * which is correct, because it is the same moment.
   *
   * An all-day event is NOT an instant. It is a date, and it means that date
   * everywhere. So it is copied across as a string and never parsed — the
   * moment you call new Date('2026-08-20') you get UTC midnight, which is the
   * previous day for anyone west of Greenwich. That is the off-by-one.
   * ============================================================ */

  /* Google's all-day `end.date` is EXCLUSIVE: a single-day event on the 20th
   * is start=2026-08-20, end=2026-08-21. Stored verbatim it would read as a
   * two-day event and linger a day too long, so it comes back one day. */
  function inclusiveEndDate(M, dateStr) {
    if (!dateStr) return null;
    var d = M.parseStamp(dateStr);          // local midnight, never UTC
    if (!d) return null;
    d.setDate(d.getDate() - 1);
    return M.dateKey(d);
  }

  function mapGoogleEvent(g, calendarId) {
    var M = global.CalendarModel;
    if (!M || !g || !g.id) return null;
    /* Cancelled instances of a recurring series come back even with
     * showDeleted off. They are holes in the series, not events. */
    if (g.status === 'cancelled') return null;

    var allDay = !!(g.start && g.start.date && !g.start.dateTime);
    var start, end = null;

    if (allDay) {
      start = g.start.date;                                   // string → string
      end = inclusiveEndDate(M, g.end && g.end.date);
    } else {
      var sd = g.start && g.start.dateTime ? new Date(g.start.dateTime) : null;
      if (!sd || !isFinite(sd.getTime())) return null;        // unusable, drop it
      start = M.timeStamp(sd);
      var ed = g.end && g.end.dateTime ? new Date(g.end.dateTime) : null;
      if (ed && isFinite(ed.getTime())) end = M.timeStamp(ed);
    }

    return M.makeEvent({
      /* Namespaced so a Google id can never collide with a local uuid once the
       * two lists are rendered together. The raw id is kept for dedupe. */
      id: 'g:' + g.id,
      title: g.summary || '(no title)',
      start: start,
      end: end,
      allDay: allDay,
      note: g.location || '',
      source: 'google',
      externalId: g.id,
      calendarId: calendarId || 'primary',
      htmlLink: g.htmlLink || null,
      ts: g.created ? Date.parse(g.created) || Date.now() : Date.now(),
      updatedAt: g.updated ? Date.parse(g.updated) || Date.now() : Date.now()
    });
  }

  /* Map a fetched page into Events, dropping what cannot be shown and
   * de-duplicating by Google's event id — with singleEvents=true each instance
   * of a recurring series carries its own unique id, so instances survive while
   * a genuine repeat does not.
   *
   * (When step 5 adds multiple calendars, the same meeting can arrive twice
   * with different ids on different calendars; dedupe there needs iCalUID.) */
  function mapEvents(items, calendarId) {
    var out = [], seen = {};
    for (var i = 0; i < (items || []).length; i++) {
      var e = mapGoogleEvent(items[i], calendarId);
      if (!e) continue;
      if (seen[e.externalId]) continue;
      seen[e.externalId] = true;
      out.push(e);
    }
    return out;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  global.GoogleCalendar = {
    SCOPES: SCOPES,
    CONN_KEY: CONN_KEY,
    CLIENT_ID_KEY: CLIENT_ID_KEY,
    init: init,
    connect: connect,
    disconnect: disconnect,
    getToken: getToken,
    handleAuthFailure: handleAuthFailure,
    setClientId: setClientId,
    status: status,
    canWrite: canWrite,
    onChange: onChange,
    // step 2 — raw API reads
    listEvents: listEvents,
    rfc3339: rfc3339,
    _classifyError: classifyError,
    // step 3 — Google shape → dashboard Event
    mapGoogleEvent: mapGoogleEvent,
    mapEvents: mapEvents,
    // step 5 — multiple calendars
    PREFS_KEY: PREFS_KEY,
    listCalendars: listCalendars,
    selectedCalendars: selectedCalendars,
    setSelectedCalendars: setSelectedCalendars,
    syncAll: syncAll,
    mapAll: mapAll,
    _dedupeKey: dedupeKey,
    // step 4 — the cache Coming up reads
    CACHE_KEY: CACHE_KEY,
    cacheEvents: cacheEvents,
    cachedEvents: cachedEvents,
    cacheInfo: cacheInfo,
    clearCache: clearCache,
    // marks the last successful fetch; step 2 calls this
    markSynced: function () { saveConn({ lastSyncAt: Date.now() }); emit(); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.GoogleCalendar;
})(typeof window !== 'undefined' ? window : globalThis);
