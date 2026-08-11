/* ============================================================
 * sync-ui.js — the sync status indicator.
 *
 * A pill in the corner that always answers three questions without being asked:
 * is my data safe, when was it last safe, and what do I do if it isn't.
 *
 *   ● Synced          — everything on this device is on the server
 *   ◍ Syncing…        — a cycle is in flight
 *   ● Offline · 3     — no connection; 3 changes queued and will go up on their own
 *   ● Sync failed     — the server said no; shows why, offers Retry
 *   ● Sign in to sync — cloud configured, this device not logged in
 *   ● Local only      — no cloud configured; nothing leaves this device
 *   ● Rescue mode     — ?rescue=1; automatic sync deliberately off
 *
 * It renders from PatronDB.status() and re-renders on 'patron:sync-status'.
 * It owns no state of its own and never touches page DOM.
 * ============================================================ */
(function () {
  if (window.__patronSyncUI) return;
  window.__patronSyncUI = true;

  var TONE = {
    synced:       { dot: 'var(--pos,#46E0A8)',  label: 'Synced' },
    syncing:      { dot: 'var(--brand,#8B7CFF)', label: 'Syncing…' },
    offline:      { dot: 'var(--warn,#F5B342)', label: 'Offline' },
    error:        { dot: 'var(--neg,#FF6B6B)',  label: 'Sync failed' },
    'signed-out': { dot: 'var(--brand,#8B7CFF)', label: 'Sign in to sync' },
    local:        { dot: 'var(--muted,rgba(243,242,248,.45))', label: 'Local only' },
    rescue:       { dot: 'var(--warn,#F5B342)', label: 'Rescue mode' }
  };

  var css =
    '#syBtn{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:99998;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;border:1px solid var(--border-strong,rgba(255,255,255,.15));background:var(--bg-elevated,rgba(20,20,30,.82));color:var(--fg,#F3F2F8);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 22px -8px rgba(0,0,0,.55);transition:transform .15s ease,border-color .15s ease}' +
    '#syBtn:hover{transform:translateY(-1px);border-color:var(--brand-line,rgba(139,124,255,.45))}' +
    '#syDot{width:8px;height:8px;border-radius:50%;background:var(--muted,#888);flex:none;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent)}' +
    '#syBtn[data-state="syncing"] #syDot{animation:syPulse 1.1s ease-in-out infinite}' +
    '@keyframes syPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.72)}}' +
    '#syCount{font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--card-elevated,rgba(255,255,255,.09));color:var(--muted-strong,rgba(243,242,248,.75))}' +
    '#syOv{position:fixed;inset:0;z-index:99999;background:rgba(6,6,12,.62);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}' +
    '#syCard{width:min(430px,100%);background:var(--bg-elevated,#15151F);border:1px solid var(--border-strong,rgba(255,255,255,.16));border-radius:18px;padding:22px;box-shadow:0 30px 72px -18px rgba(0,0,0,.66);color:var(--fg,#F3F2F8);font-family:inherit}' +
    '#syCard h2{font-family:var(--font-serif,inherit);font-size:1.32rem;margin:0 0 2px;display:flex;align-items:center;gap:9px}' +
    '#syWhen{font-size:12.5px;color:var(--muted,rgba(243,242,248,.55));margin:0 0 16px}' +
    '.syRow{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:8px 0;border-top:1px solid var(--border,rgba(255,255,255,.08))}' +
    '.syRow span:first-child{color:var(--muted,rgba(243,242,248,.55))}' +
    '.syRow span:last-child{font-family:var(--font-mono,ui-monospace,monospace);text-align:right;word-break:break-word}' +
    '#syErr{font-size:12px;line-height:1.5;color:var(--neg,#FF6B6B);background:var(--neg-soft,rgba(255,107,107,.1));border:1px solid var(--neg-line,rgba(255,107,107,.28));border-radius:11px;padding:10px 12px;margin:0 0 14px;word-break:break-word}' +
    '#syNote{font-size:12px;line-height:1.55;color:var(--muted,rgba(243,242,248,.55));margin:14px 0 0}' +
    '.syBtns{display:flex;gap:9px;margin-top:16px}' +
    '.syBtns button{flex:1;padding:11px;border-radius:12px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid transparent}' +
    '.syPrimary{background:var(--brand,#8B7CFF);color:var(--brand-ink,#130E2E)}' +
    '.syGhost{background:transparent;border-color:var(--border-strong,rgba(255,255,255,.16));color:var(--fg,#fff)}' +
    '.syBtns button:disabled{opacity:.5;cursor:default}' +
    '#syCard input{width:100%;box-sizing:border-box;padding:11px 12px;margin:0 0 10px;background:var(--card-elevated,rgba(255,255,255,.055));border:1px solid var(--border-strong,rgba(255,255,255,.16));border-radius:12px;color:var(--fg,#fff);font-family:inherit;font-size:16px;outline:none}' +
    '#syCard input:focus{border-color:var(--brand-line,rgba(139,124,255,.45))}' +
    '#syCard label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,rgba(243,242,248,.5));margin:0 0 6px}' +
    '#syCard details{margin-top:16px}' +
    '#syCard summary{cursor:pointer;font-size:12px;color:var(--muted,rgba(243,242,248,.55))}' +
    '#syCard a{color:var(--brand,#8B7CFF)}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'syBtn'; btn.type = 'button';
  btn.innerHTML = '<i id="syDot"></i><span id="syLabel">Local only</span>';

  function st() {
    return (window.PatronDB && PatronDB.status) ? PatronDB.status()
      : { state: 'local', pending: 0, lastSyncedAt: null, error: null, email: null, rescue: false };
  }

  function ago(ts) {
    if (!ts) return 'never synced';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + ' seconds ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return new Date(ts).toLocaleString();
  }

  function paint() {
    var s = st(), tone = TONE[s.state] || TONE.local;
    btn.setAttribute('data-state', s.state);
    btn.querySelector('#syDot').style.background = tone.dot;
    var label = tone.label;
    if (s.state === 'synced' && s.lastSyncedAt) label = 'Synced';
    btn.querySelector('#syLabel').textContent = label;

    var badge = btn.querySelector('#syCount');
    if (s.pending > 0 && s.state !== 'signed-out' && s.state !== 'local') {
      if (!badge) { badge = document.createElement('span'); badge.id = 'syCount'; btn.appendChild(badge); }
      badge.textContent = s.pending;
      badge.title = s.pending + ' change' + (s.pending === 1 ? '' : 's') + ' waiting to upload';
    } else if (badge) { badge.remove(); }

    if (document.getElementById('syOv')) renderPanel();
  }

  btn.addEventListener('click', openPanel);
  if (document.body) document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(btn); });

  window.addEventListener('patron:sync-status', paint);
  window.addEventListener('patrondb:ready', paint);
  setInterval(function () { if (document.getElementById('syOv')) renderPanel(); }, 20000);
  paint();

  /* ---------- panel ---------- */
  var pendingEmail = '';

  function openPanel() {
    if (document.getElementById('syOv')) return;
    var ov = document.createElement('div');
    ov.id = 'syOv';
    ov.innerHTML = '<div id="syCard"></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    renderPanel();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function renderPanel() {
    var card = document.querySelector('#syOv #syCard');
    if (!card) return;
    var s = st(), tone = TONE[s.state] || TONE.local;
    var h = '';

    h += '<h2><i style="width:10px;height:10px;border-radius:50%;background:' + tone.dot + ';display:inline-block"></i>' + esc(tone.label) + '</h2>';
    h += '<p id="syWhen">Last synced ' + esc(ago(s.lastSyncedAt)) + '</p>';

    if (s.error) h += '<div id="syErr">' + esc(s.error) + '</div>';

    // Keyed on "no session" rather than on the signed-out state: a device opened
    // in rescue mode reports state 'rescue' but still has to be able to sign in,
    // or Push this device up — the whole point of rescue mode — can't run.
    if (s.state !== 'local' && !s.email) {
      h += '<p id="syNote" style="margin:0 0 14px">' +
           (s.rescue ? 'Automatic sync is off for this page load, so nothing has been pulled down over this device. Sign in, then use Push this device up under Advanced. '
                     : '') +
           'Sign in once on each device. Your login is what keeps your data yours — without it the database is readable by anyone with the public key.</p>';
      if (!pendingEmail) {
        h += '<label>Email</label><input id="syEmail" type="email" autocomplete="email" placeholder="you@example.com">' +
             '<div class="syBtns"><button class="syGhost" id="syClose" type="button">Close</button>' +
             '<button class="syPrimary" id="sySend" type="button">Send sign-in email</button></div>';
      } else {
        h += '<p id="syNote" style="margin:0 0 12px">Sent to ' + esc(pendingEmail) + '. Open the link in that email, ' +
             '<em>or</em> paste the 6-digit code if the mail has one. On a phone the code is more reliable — a link opened ' +
             'from a mail app can land in a different browser than this one.</p>' +
             '<label>6-digit code</label><input id="syCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">' +
             '<div class="syBtns"><button class="syGhost" id="syBack" type="button">Back</button>' +
             '<button class="syPrimary" id="syVerify" type="button">Verify &amp; sync</button></div>';
      }
    } else if (s.state === 'local') {   // no project configured at all
      h += '<p id="syNote" style="margin:0 0 14px">No cloud project is configured, so everything stays on this device. Add your Supabase keys below to sync across devices.</p>' +
           '<div class="syBtns"><button class="syGhost" id="syClose" type="button">Close</button></div>';
    } else {
      h += '<div class="syRow"><span>Pending changes</span><span>' + s.pending + '</span></div>';
      h += '<div class="syRow"><span>Account</span><span>' + esc(s.email || '—') + '</span></div>';
      h += '<div class="syRow"><span>This device</span><span>' + esc(s.device || '—') + '</span></div>';
      if (s.rescue) {
        h += '<p id="syNote">Automatic sync is off for this page load, so nothing has been pulled down over this device. If this device still has data the server lost, push it up now.</p>';
      }
      h += '<div class="syBtns">' +
           '<button class="syGhost" id="syClose" type="button">Close</button>' +
           '<button class="syPrimary" id="syNow" type="button">' + (s.state === 'error' || s.state === 'offline' ? 'Retry now' : 'Sync now') + '</button>' +
           '</div>';
    }

    h += '<details><summary>Advanced</summary>' +
         '<div class="syBtns" style="margin-top:12px">' +
         '<button class="syGhost" id="syPush" type="button">&#10514; Push this device up</button>' +
         '<button class="syGhost" id="syPull" type="button">&#10515; Pull server down</button>' +
         '</div>' +
         '<p id="syNote">Overwrites one side with the other. Normal syncing merges instead — you should not need these.</p>' +
         '<label style="margin-top:14px">Supabase project URL</label><input id="syUrl" type="text" spellcheck="false" placeholder="https://YOUR-PROJECT.supabase.co" value="' + esc(cfg('url')) + '">' +
         '<label>Anon public key</label><input id="syKey" type="password" spellcheck="false" placeholder="paste the anon public key" value="' + esc(cfg('key')) + '">' +
         '<div class="syBtns"><button class="syGhost" id="sySaveKeys" type="button">Save keys &amp; reload</button>' +
         (s.email ? '<button class="syGhost" id="sySignOut" type="button">Sign out</button>' : '') +
         '</div></details>';

    card.innerHTML = h;
    wire(card);
  }

  function cfg(which) {
    try {
      if (which === 'url') return localStorage.getItem('po_supabase_url') || '';
      return localStorage.getItem('po_supabase_key') || '';
    } catch (_) { return ''; }
  }

  // "Push failed." on its own sends you hunting. Say which of the two things it
  // actually is: not signed in, or the request didn't get through.
  function whyFailed() {
    var s = st();
    if (!s.email) return 'You need to sign in on this device first — the database only accepts writes from a signed-in account.';
    if (s.error) return s.error;
    return 'That did not get through. Check your connection and try again.';
  }

  function wire(card) {
    function on(id, fn) { var el = card.querySelector('#' + id); if (el) el.onclick = fn; return el; }
    function close() { var ov = document.getElementById('syOv'); if (ov) ov.remove(); }
    function busy(el, text) { if (el) { el.disabled = true; el.dataset.prev = el.textContent; el.textContent = text; } }
    function done(el) { if (el && el.dataset.prev) { el.disabled = false; el.textContent = el.dataset.prev; } }

    on('syClose', close);
    on('syNow', function () {
      var b = card.querySelector('#syNow'); busy(b, 'Syncing…');
      PatronDB.syncNow().then(function () { done(b); renderPanel(); });
    });
    on('sySend', function () {
      var email = (card.querySelector('#syEmail') || {}).value;
      if (!email) return;
      var b = card.querySelector('#sySend'); busy(b, 'Sending…');
      PatronDB.signIn(email.trim()).then(function (r) {
        done(b);
        if (r.ok) { pendingEmail = email.trim(); renderPanel(); }
        else alert(r.error || 'Could not send the code.');
      });
    });
    on('syBack', function () { pendingEmail = ''; renderPanel(); });
    on('syVerify', function () {
      var code = (card.querySelector('#syCode') || {}).value;
      if (!code) return;
      var b = card.querySelector('#syVerify'); busy(b, 'Verifying…');
      PatronDB.verifyCode(pendingEmail, code).then(function (r) {
        done(b);
        if (r.ok) { pendingEmail = ''; renderPanel(); }
        else alert(r.error || 'That code did not work.');
      });
    });
    on('sySignOut', function () { PatronDB.signOut().then(function () { renderPanel(); }); });
    on('syPush', function () {
      if (!confirm('Replace the server’s copy with this device’s data?\n\nAnything that exists only on another device will be removed.')) return;
      var b = card.querySelector('#syPush'); busy(b, 'Pushing…');
      PatronDB.pushAll().then(function (r) {
        done(b);
        alert(r.ok ? 'Pushed ' + r.n + ' items up. Reload your other devices.' : whyFailed());
        renderPanel();
      });
    });
    on('syPull', function () {
      if (!confirm('Replace this device’s data with the server’s copy?\n\nAnything that exists only here will be removed.')) return;
      var b = card.querySelector('#syPull'); busy(b, 'Pulling…');
      PatronDB.pullAll().then(function (r) {
        done(b);
        if (r.ok) { alert('Pulled ' + r.n + ' items down. Reloading…'); location.reload(); }
        else alert(st().email ? 'Nothing on the server yet.' : whyFailed());
      });
    });
    on('sySaveKeys', function () {
      var u = (card.querySelector('#syUrl') || {}).value.trim(), k = (card.querySelector('#syKey') || {}).value.trim();
      try {
        if (u && k) { localStorage.setItem('po_supabase_url', u); localStorage.setItem('po_supabase_key', k); }
        else { localStorage.removeItem('po_supabase_url'); localStorage.removeItem('po_supabase_key'); }
      } catch (_) {}
      location.reload();
    });
  }
})();
