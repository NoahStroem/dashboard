/* ============================================================
 * cloud-sync.js — a tiny, self-contained "☁ Cloud sync" button.
 *
 * Drop-in: include AFTER supabase-js + db.js on any page:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="db.js"></script>
 *   <script src="cloud-sync.js"></script>
 *
 * It appends its own floating button + panel — it never touches the page's
 * own DOM/render, so it can't break anything. The user pastes their Supabase
 * Project URL + anon key once; we save them to the shared keys every page reads
 * (po_supabase_url / po_supabase_key) and reload so sync turns on everywhere.
 * ============================================================ */
(function () {
  if (window.__patronCloudUI) return;
  window.__patronCloudUI = true;

  var URL_KEY = 'po_supabase_url', ANON_KEY = 'po_supabase_key';
  function getU() { return (localStorage.getItem(URL_KEY) || '').trim(); }
  function getK() { return (localStorage.getItem(ANON_KEY) || '').trim(); }
  // Connected = either keys are pasted OR db.js has a working (baked-in) connection.
  function connected() { return (window.PatronDB && PatronDB.isCloud()) || !!(getU() && getK()); }

  var style = document.createElement('style');
  style.textContent =
    '#csBtn{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:99998;display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:999px;border:1px solid var(--brand-line,rgba(139,124,255,.4));background:var(--brand-soft,rgba(139,124,255,.14));color:var(--brand,#8B7CFF);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
    '#csBtn[data-on="1"]{color:var(--pos,#46E0A8);border-color:var(--pos-line,rgba(70,224,168,.4));background:var(--pos-soft,rgba(70,224,168,.12))}' +
    '#csOverlay{position:fixed;inset:0;z-index:99999;background:rgba(6,6,12,.66);display:flex;align-items:center;justify-content:center;padding:18px}' +
    '#csCard{width:min(440px,100%);background:var(--bg-elevated,#15151F);border:1px solid var(--border-strong,rgba(255,255,255,.17));border-radius:16px;padding:22px;box-shadow:0 28px 70px -16px rgba(0,0,0,.6);color:var(--fg,#F3F2F8);font-family:inherit}' +
    '#csCard h2{font-family:var(--font-serif,inherit);font-size:1.4rem;margin:0 0 4px}' +
    '#csCard p{font-size:13px;line-height:1.5;color:var(--muted-strong,rgba(243,242,248,.74));margin:0 0 14px}' +
    '#csCard label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,rgba(243,242,248,.5));margin:0 0 5px}' +
    '#csCard input{width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 12px;background:var(--card-elevated,rgba(255,255,255,.055));border:1px solid var(--border-strong,rgba(255,255,255,.17));border-radius:11px;color:var(--fg,#fff);font-family:inherit;font-size:16px;outline:none}' +
    '#csCard input:focus{border-color:var(--brand-line,rgba(139,124,255,.4))}' +
    '.csRow{display:flex;gap:10px;margin-top:6px}' +
    '.csRow button{flex:1;padding:11px;border-radius:11px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1px solid transparent}' +
    '#csSave{background:var(--brand,#8B7CFF);color:var(--brand-ink,#130E2E)}' +
    '#csCancel{background:transparent;border-color:var(--border,rgba(255,255,255,.12));color:var(--fg,#fff)}' +
    '#csDisconnect{background:transparent;border:0;color:var(--muted,rgba(243,242,248,.5));font-size:12px;cursor:pointer;margin-top:12px;text-decoration:underline}' +
    '#csStatus{font-family:var(--font-mono,monospace);font-size:11px;margin:0 0 14px}' +
    '#csCard a{color:var(--brand,#8B7CFF)}';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'csBtn'; btn.type = 'button';
  function paint() { btn.textContent = connected() ? '☁ Synced' : '☁ Cloud sync'; btn.setAttribute('data-on', connected() ? '1' : '0'); }
  paint();
  btn.addEventListener('click', openPanel);
  // Mount once <body> exists (so this include can sit in <head> or <body>).
  if (document.body) document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(btn); });

  function openPanel() {
    var ov = document.createElement('div');
    ov.id = 'csOverlay';
    ov.innerHTML =
      '<div id="csCard">' +
      '<h2>Cloud sync</h2>' +
      '<p>Sync your data + photos across devices with your own free <a href="https://supabase.com" target="_blank" rel="noopener">Supabase</a> project. Run <code>supabase-schema.sql</code> once, then paste your keys below. Leave blank to keep everything on this device.</p>' +
      '<p id="csStatus">' + (connected() ? '✓ Connected — syncing automatically across your devices.' : 'Local-only — data stays on this device.') + '</p>' +
      '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px;opacity:.7">Advanced: use your own Supabase project</summary>' +
      '<label style="margin-top:10px">Project URL</label><input id="csUrl" type="text" autocomplete="off" spellcheck="false" placeholder="https://YOUR-PROJECT.supabase.co" value="' + getU().replace(/"/g, '&quot;') + '">' +
      '<label>Anon public key</label><input id="csKey" type="password" autocomplete="off" spellcheck="false" placeholder="paste the anon public key" value="' + getK().replace(/"/g, '&quot;') + '">' +
      '<div class="csRow"><button id="csCancel" type="button">Close</button><button id="csSave" type="button">Save &amp; sync</button></div>' +
      (getU() || getK() ? '<button id="csDisconnect" type="button">reset to default</button>' : '') +
      '</details>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('csCancel').onclick = close;
    document.getElementById('csSave').onclick = function () {
      var u = document.getElementById('csUrl').value.trim(), k = document.getElementById('csKey').value.trim();
      if (u && k) { localStorage.setItem(URL_KEY, u); localStorage.setItem(ANON_KEY, k); }
      else { localStorage.removeItem(URL_KEY); localStorage.removeItem(ANON_KEY); }
      location.reload(); // reload so db.js picks up the new keys everywhere
    };
    var dc = document.getElementById('csDisconnect');
    if (dc) dc.onclick = function () { localStorage.removeItem(URL_KEY); localStorage.removeItem(ANON_KEY); location.reload(); };
    function close() { ov.remove(); }
  }
})();
