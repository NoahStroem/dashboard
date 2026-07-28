/**
 * THE LIBRARY - the board's settings panel.
 *
 * A gear, fixed top-right. Tap it and the Library opens full-window: every tile,
 * split into "on your dashboard" and "in your library", with the sidebar (views +
 * categories), list / gallery, and one-tap add / remove / delete.
 *
 * The DESIGN is ported pixel-for-pixel from Vitality's library-demo.html (the same
 * CSS, the same markup shape) so the seed's Library looks identical to the app's.
 * The DATA is wired to this board: window.TILES (registry.js) + v:board state, not
 * hardcoded demo tiles. The upload button and the search bar from the demo are
 * removed on purpose; everything else is the demo.
 *
 * IT INJECTS ITSELF. Gear, styles and overlay are all built here, so adding the
 * Library to a board is ONE line in index.html. Delete that line and the board is
 * the bare seed again (host.js only honours v:board while window.VitalityLibrary
 * exists).
 *
 * STATE. v:board = { hidden:[ids], deleted:[ids] }.
 *   hidden  -> in your library (off the dashboard, still listed). host.js skips it.
 *   deleted -> gone from the library entirely (also added to hidden so the board
 *              drops it). The registry file is untouched; the mentor does a true
 *              delete. This is the runtime one.
 */
;(function () {
  'use strict'

  var KEY = 'v:board'
  function state() {
    try { var b = JSON.parse(window.localStorage.getItem(KEY) || '{}'); return b && typeof b === 'object' ? b : {} }
    catch (e) { return {} }
  }
  function arr(v) { return Array.isArray(v) ? v : [] }
  function hiddenList() { return arr(state().hidden) }
  function deletedList() { return arr(state().deleted) }
  function write(patch) {
    var b = state(); for (var k in patch) b[k] = patch[k]
    try { window.localStorage.setItem(KEY, JSON.stringify(b)) } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // ── Icons (from library-demo.html, verbatim shapes). ──────────────────────
  function svg(inner, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.7) +
      '" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'
  }
  var IC = {
    lock: svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', 1.8),
    lockmini: svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', 1.8),
    list: svg('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>'),
    gallery: svg('<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>'),
    x: svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 1.8),
    navAll: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>'),
    navDash: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
    navLib: svg('<path d="M4 19V6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>'),
    tick: svg('<path d="m5 13 4 4L19 7"/>', 2.4),
    // tile glyphs
    library: svg('<rect x="4" y="4" width="6" height="16" rx="1.4"/><rect x="11.5" y="4" width="6" height="16" rx="1.4"/><path d="M19.4 6.6l1.9 13.7-3.7.5"/>'),
    train: svg('<path d="M6.5 9v6M17.5 9v6M4 12h2.5M17.5 12H20M6.5 12h11"/>'),
    fuel: svg('<path d="M12 3c2.5 2.5 4 5 4 8a4 4 0 0 1-8 0c0-3 1.5-5.5 4-8Z"/>'),
    vee: svg('<path d="M12 4c4 0 7 2.7 7 6.3 0 3.6-3 6.3-7 6.3-.8 0-1.5-.1-2.2-.3L6 18l.7-2.8C5.6 14 5 12.2 5 10.3 5 6.7 8 4 12 4Z"/><circle cx="9.6" cy="10.3" r=".7" fill="currentColor"/><circle cx="14.4" cy="10.3" r=".7" fill="currentColor"/>', 1.6),
    vitals: svg('<path d="M3.5 12h4l2.2-6 3.4 12 2.1-6H20.5"/>'),
    peak: svg('<path d="M3 19h18"/><path d="m3 19 5.5-9 3.5 4.5 2.5-4L21 19"/>'),
    finance: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6v8.8M9.7 9.4c0-1 1-1.6 2.3-1.6s2.3.7 2.3 1.6c0 2.1-4.6 1-4.6 3.2 0 1 1 1.6 2.3 1.6s2.3-.6 2.3-1.5"/>'),
    brand: svg('<circle cx="12" cy="12" r="2.6"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6"/>'),
    generic: svg('<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>')
  }

  // What each known Vitality tile is: subtitle, category, glyph. A registry entry
  // may override with { sub, cat, glyph }. Everything else falls back to a generic
  // "measure" tile you can still place, remove and delete.
  var KNOWN = {
    train:   { sub: 'Workout logger',   cat: 'core', ic: 'train' },
    fuel:    { sub: 'Macros and water', cat: 'core', ic: 'fuel' },
    vee:     { sub: 'Your companion',   cat: 'core', ic: 'vee' },
    vitals:  { sub: 'Daily signal',     cat: 'core', ic: 'vitals' },
    peak:    { sub: 'Periodization',    cat: 'core', ic: 'peak' },
    finance: { sub: 'Net worth and subs', cat: 'core', ic: 'finance' },
    brand:   { sub: 'Reach and posts',  cat: 'core', ic: 'brand' }
  }
  var CAT_LABEL = { core: 'Core', intake: 'Intake', count: 'Count', duration: 'Duration', measure: 'Measure' }

  function metaFor(t) {
    var k = KNOWN[t.id]
    var cat = (t.cat && CAT_LABEL[t.cat]) ? t.cat : (k ? k.cat : 'measure')
    var core = cat === 'core'
    return {
      id: t.id,
      name: t.name || t.id,
      sub: t.sub || (k ? k.sub : ''),
      cat: cat,
      core: core,
      icon: IC[t.glyph] || IC[k ? k.ic : ''] || IC.generic
    }
  }

  function registry() {
    var del = deletedList()
    return (Array.isArray(window.TILES) ? window.TILES : [])
      .filter(function (t) { return t && t.id && t.file && del.indexOf(t.id) === -1 })
  }

  // ── Styles: the demo's component CSS, verbatim, plus the gear + the few vars
  //    the seed's :root doesn't already define. No global element rules (the seed
  //    owns those), so nothing leaks onto the board. ─────────────────────────
  function injectStyles() {
    if (document.getElementById('vlibStyles')) return
    var s = document.createElement('style')
    s.id = 'vlibStyles'
    s.textContent = [
      ':root{--sheet:#070707;--elevated:#0a0a0a;--card-2:rgba(255,255,255,.04);--gold:#cbb87e;--spring:cubic-bezier(.34,1.56,.64,1)}',
      /* gear */
      '.vlibGear{position:fixed;top:calc(16px + env(safe-area-inset-top,0px));right:calc(16px + env(safe-area-inset-right,0px));z-index:40;width:42px;height:42px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:rgba(9,13,12,.55);color:var(--muted-strong,rgba(255,255,255,.7));cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:color .18s,border-color .18s,transform .18s}',
      '.vlibGear:hover{color:var(--mint,#6EE7B7);border-color:rgba(110,231,183,.5)}.vlibGear:active{transform:scale(.94)}.vlibGear svg{width:20px;height:20px;display:block}',
      /* overlay design (library-demo.html, .scrim onward, verbatim) */
      '.scrim svg{display:block}',
      '.scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 22px 24px}',
      '.win{width:min(1080px,100%);height:min(740px,92vh);display:grid;grid-template-rows:auto 1fr;border:1px solid var(--border-strong);background:radial-gradient(1100px 380px at 22% -8%,rgba(110,231,183,.05),transparent 62%),var(--sheet);border-radius:24px;overflow:hidden;box-shadow:0 48px 120px -28px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.02) inset;animation:cozyPop .55s var(--spring) both}',
      '@keyframes cozyPop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}',
      '.scrim.closing{opacity:0;transition:opacity .4s var(--ease);pointer-events:none}.scrim.closing .win{transform:scale(.96);transition:transform .4s var(--ease)}',
      '@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.fade{opacity:0;animation:fadeUp .48s var(--ease-premium) both}',
      '.chrome{--rail:268px;display:grid;grid-template-columns:var(--rail) 1fr;border-bottom:1px solid var(--border)}',
      '.brand{padding:24px 24px 20px;border-right:1px solid var(--border);display:flex;align-items:center;gap:12px}',
      ".title{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:2.4rem;line-height:.9;letter-spacing:.2px;display:flex;align-items:center;gap:12px}",
      '.title .lock{display:inline-flex;width:22px;height:22px;color:var(--mint);margin-top:3px}',
      '.toolbar{display:flex;align-items:center;gap:14px;padding:0 22px}',
      '.seg{display:inline-flex;padding:3px;gap:3px;border:1px solid var(--border);background:var(--card);border-radius:12px}',
      '.seg button{appearance:none;border:0;background:transparent;color:var(--muted-strong);display:inline-flex;align-items:center;gap:7px;font-size:.8125rem;font-weight:600;letter-spacing:-.01em;padding:7px 13px;border-radius:9px;cursor:pointer;transition:background .18s,color .18s}',
      '.seg button svg{width:14px;height:14px}.seg button.on{background:var(--card-2);color:var(--fg);box-shadow:0 1px 0 rgba(255,255,255,.05) inset}.seg button:not(.on):hover{color:var(--fg)}',
      '.toolspacer{flex:1}',
      '.x{appearance:none;border:1px solid var(--border-strong);background:transparent;color:var(--fg);width:36px;height:36px;border-radius:999px;cursor:pointer;flex:none;display:grid;place-items:center;transition:background .18s,border-color .18s,transform .12s}.x:hover{background:var(--card-2);border-color:var(--mint)}.x:active{transform:scale(.94)}.x svg{width:15px;height:15px}',
      '.body{display:grid;grid-template-columns:268px 1fr;min-height:0}',
      '.side{border-right:1px solid var(--border);padding:18px 12px;overflow:auto;background:linear-gradient(180deg,rgba(255,255,255,.014),transparent)}.side::-webkit-scrollbar{width:0}',
      '.sgroup{margin-bottom:22px}.sglabel{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 10px 10px;font-weight:600}',
      '.nav{appearance:none;width:100%;text-align:left;border:0;background:transparent;color:var(--muted-strong);display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:.8125rem;font-weight:500;letter-spacing:-.01em;transition:background .16s,color .16s;position:relative}',
      '.nav .gi{width:18px;height:18px;flex:none;color:var(--muted);display:grid;place-items:center;transition:color .16s}.nav .gi svg{width:17px;height:17px}',
      '.nav .lab{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nav .cnt{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;opacity:.85;transition:color .16s}',
      '.nav:hover{background:var(--card-2);color:var(--fg)}.nav:hover .gi{color:var(--muted-strong)}.nav.on{background:rgba(110,231,183,.1);color:var(--fg)}.nav.on .gi{color:var(--mint)}.nav.on .cnt{color:var(--muted-strong)}',
      '.nav.on::before{content:"";position:absolute;left:-12px;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:0 3px 3px 0;background:var(--mint)}',
      '.swatch{width:9px;height:9px;border-radius:3px;flex:none}.swatch.core{background:var(--gold)}.swatch.mine{background:var(--mint)}',
      '.main{overflow:auto;min-height:0;scroll-behavior:smooth;position:relative}.main::-webkit-scrollbar{width:9px}.main::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:99px;border:2px solid var(--sheet)}.scroller{padding:8px 24px 24px}',
      '.cols{display:grid;grid-template-columns:1fr 120px 116px 224px;padding:0 14px 10px;margin-top:8px;font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--sheet);z-index:3}.cols .right{text-align:right}',
      '.seclabel{display:flex;align-items:center;gap:9px;margin:24px 4px 8px;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}.seclabel .c{color:var(--muted);opacity:.6;font-weight:500;font-variant-numeric:tabular-nums}.seclabel .pip{width:6px;height:6px;border-radius:50%;background:var(--mint)}.seclabel .pip.dim{background:var(--muted-strong);opacity:.45}',
      '.list{display:flex;flex-direction:column}',
      '.item{display:grid;grid-template-columns:1fr 120px 116px 224px;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid transparent;transition:background .2s,border-color .2s,box-shadow .2s,transform .2s}',
      '.item + .item{border-top:1px solid var(--border)}.item:hover{background:var(--card-2);border-color:rgba(110,231,183,.28);box-shadow:0 0 44px rgba(110,231,183,.07);transform:translateY(-2px)}.item:hover + .item{border-top-color:transparent}',
      '.cell-name{display:flex;align-items:center;gap:13px;min-width:0}.art{display:contents}',
      '.tileicon{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;position:relative;border:1px solid var(--border-strong);background:linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.015));color:var(--muted-strong)}.tileicon svg{width:19px;height:19px}',
      '.tileicon.core{color:var(--gold);border-color:rgba(203,184,126,.32);background:linear-gradient(160deg,rgba(203,184,126,.14),rgba(203,184,126,.02))}.tileicon.mine{color:var(--mint);border-color:rgba(110,231,183,.3);background:linear-gradient(160deg,rgba(110,231,183,.12),rgba(110,231,183,.02))}',
      '.item[data-state="dash"] .tileicon::after{content:"";position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:var(--mint);border:2px solid var(--sheet);box-shadow:0 0 7px rgba(110,231,183,.8);animation:livingDot 2.6s ease-in-out infinite}@keyframes livingDot{0%,100%{opacity:.55}50%{opacity:1}}',
      '.namewrap{min-width:0}.nm{font-size:.9375rem;font-weight:600;letter-spacing:-.012em;display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nm .lockmini{width:13px;height:13px;color:var(--muted);flex:none}.sublabel{margin-top:2px;font-size:.78rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.chip{border:1px solid var(--border-strong);border-radius:999px;padding:3px 11px;font-size:.72rem;font-weight:600;letter-spacing:-.005em;color:var(--muted-strong);display:inline-block;white-space:nowrap}.chip.core{color:var(--gold);border-color:rgba(203,184,126,.28);background:rgba(203,184,126,.07)}.chip.mine{color:var(--mint);border-color:rgba(110,231,183,.34);background:rgba(110,231,183,.06)}',
      '.cell-date{font-size:.78rem;color:var(--muted);font-variant-numeric:tabular-nums}.meta-row{display:contents}',
      '.acts{display:flex;align-items:center;gap:7px;justify-content:flex-end;opacity:0;transition:opacity .18s}.item:hover .acts,.item:focus-within .acts{opacity:1}',
      '.a{font-size:.78rem;font-weight:600;letter-spacing:-.01em;border-radius:9px;padding:7px 11px;cursor:pointer;border:1px solid var(--border-strong);background:var(--card-2);color:var(--fg);white-space:nowrap;transition:background .16s,border-color .16s,transform .12s}.a:hover{border-color:var(--mint)}.a:active{transform:scale(.95)}',
      '.a.add{background:var(--mint);color:var(--mint-ink);border-color:transparent}.a.add:hover{background:var(--mint-hover)}.a.sub{color:var(--muted-strong);background:transparent}.a.del{color:var(--amber);border-color:rgba(245,158,11,.36);background:rgba(245,158,11,.05)}.a.del:hover{border-color:var(--amber)}',
      '.lockedtag{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:5px 11px}.lockedtag svg{width:12px;height:12px}.item[data-locked] .acts{opacity:1}',
      /* gallery */
      '.main[data-view="gallery"] .cols{display:none}.main[data-view="gallery"] .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:14px;padding-top:4px}',
      '.main[data-view="gallery"] .item{display:flex;flex-direction:column;align-items:flex-start;gap:0;border:1px solid var(--border);background:var(--card-2);border-radius:18px;padding:0;overflow:hidden}.main[data-view="gallery"] .item + .item{border-top:1px solid var(--border)}.main[data-view="gallery"] .item:hover{transform:translateY(-2px);border-color:rgba(110,231,183,.28);box-shadow:0 0 44px rgba(110,231,183,.07)}',
      '.main[data-view="gallery"] .cell-name{flex-direction:column;align-items:flex-start;gap:0;width:100%}.main[data-view="gallery"] .art{display:grid;width:100%;height:106px;place-items:center;position:relative;border-bottom:1px solid var(--border);background:linear-gradient(150deg,rgba(255,255,255,.05),rgba(255,255,255,.01))}',
      '.main[data-view="gallery"] .item[data-cat="core"] .art{background:linear-gradient(150deg,rgba(203,184,126,.16),rgba(203,184,126,.02))}.main[data-view="gallery"] .item[data-cat="intake"] .art,.main[data-view="gallery"] .item[data-cat="count"] .art,.main[data-view="gallery"] .item[data-cat="duration"] .art,.main[data-view="gallery"] .item[data-cat="measure"] .art{background:linear-gradient(150deg,rgba(110,231,183,.16),rgba(110,231,183,.02))}',
      '.main[data-view="gallery"] .tileicon{width:48px;height:48px;border-radius:14px;border-color:transparent;background:rgba(0,0,0,.18)}.main[data-view="gallery"] .tileicon svg{width:24px;height:24px}.main[data-view="gallery"] .namewrap{padding:14px 16px 0;width:100%}.main[data-view="gallery"] .sublabel{white-space:normal}',
      '.main[data-view="gallery"] .chip-cell{margin:12px 16px 0;order:2}.main[data-view="gallery"] .meta-row{display:flex;flex-direction:column;width:100%;order:3}.main[data-view="gallery"] .cell-date{margin:8px 16px 0;order:4;font-size:.72rem}.main[data-view="gallery"] .acts{order:5;margin:14px 16px 16px;width:calc(100% - 32px);justify-content:flex-start;flex-wrap:wrap;opacity:1}.main[data-view="gallery"] .a{background:transparent}.main[data-view="gallery"] .a.add{background:var(--mint)}',
      '.main[data-view="gallery"] .item[data-state="dash"] .tileicon::after{display:none}.main[data-view="gallery"] .item[data-state="dash"] .art::after{content:"";position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px rgba(110,231,183,.8);animation:livingDot 2.6s ease-in-out infinite}',
      '.foot{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:28px;padding-top:20px;border-top:1px solid var(--border)}.done{border:1px solid var(--border-strong);background:transparent;color:var(--fg);font-weight:600;font-size:.8125rem;letter-spacing:-.01em;border-radius:11px;padding:10px 22px;cursor:pointer;transition:background .16s,transform .12s}.done:hover{background:var(--card-2)}.done:active{transform:scale(.97)}',
      '.empty{display:none;padding:60px 14px;text-align:center;color:var(--muted)}.empty .ei{width:46px;height:46px;margin:0 auto 14px;border-radius:13px;display:grid;place-items:center;border:1px solid var(--border);color:var(--muted)}.empty .ei svg{width:22px;height:22px}.empty .et{font-size:.9375rem;font-weight:600;color:var(--muted-strong);margin-bottom:6px}.empty .eb{font-size:.8125rem;line-height:1.5;max-width:34ch;margin:0 auto}',
      '.vtoast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%) translateY(20px);z-index:95;display:none;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;border:1px solid rgba(110,231,183,.28);background:rgba(10,10,10,.92);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 18px 48px -18px rgba(0,0,0,.9),0 0 44px rgba(110,231,183,.07);color:var(--fg);font-size:.8125rem;font-weight:600;white-space:nowrap}.vtoast.show{display:flex;animation:toastIn .42s var(--spring) both}@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}.vtoast .td{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:rgba(110,231,183,.16);color:var(--mint);flex:none}.vtoast .td svg{width:11px;height:11px}',
      '.mside{display:none}',
      '@media(max-width:860px){.win{height:94vh;grid-template-rows:auto auto 1fr}.chrome{grid-template-columns:1fr;--rail:0}.brand{border-right:0;padding-bottom:16px}.toolbar{border-top:1px solid var(--border);padding:14px 18px;flex-wrap:wrap;gap:10px}.body{grid-template-columns:1fr}.side{display:none}.mside{display:flex;gap:8px;overflow-x:auto;padding:14px 18px 4px;border-bottom:1px solid var(--border)}.mside::-webkit-scrollbar{display:none}.mside .pill{flex:none;min-height:40px;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--card);color:var(--muted-strong);font-size:.8125rem;font-weight:600;padding:8px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}.mside .pill.on{background:rgba(110,231,183,.12);color:var(--fg);border-color:rgba(110,231,183,.4)}.mside .pill .cnt{color:var(--muted)}.cols{grid-template-columns:1fr 110px 100px 200px}.acts{opacity:1}.a{min-height:40px;display:inline-flex;align-items:center}}',
      '@media(max-width:560px){.scrim{padding:10px 8px}.win{border-radius:20px;height:96vh}.title{font-size:1.85rem}.cols{display:none}.item{grid-template-columns:1fr auto;grid-template-areas:"name chip" "meta meta";gap:10px 12px;padding:15px 14px}.item:hover{transform:none}.cell-name{grid-area:name}.chip-cell{grid-area:chip;justify-self:end;align-self:center}.item .meta-row{grid-area:meta;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-left:51px}.acts{opacity:1!important;justify-content:flex-start;flex-wrap:wrap}.a{min-height:40px;background:transparent}.a.add{background:var(--mint)}}',
      '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}.fade{opacity:1}}'
    ].join('')
    document.head.appendChild(s)
  }

  // ── The gear. ─────────────────────────────────────────────────────────────
  var COG = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 1.7)

  function mountGear() {
    if (document.getElementById('vlibGear')) return
    injectStyles()
    var g = document.createElement('button')
    g.id = 'vlibGear'; g.className = 'vlibGear'; g.type = 'button'
    g.setAttribute('aria-label', 'Library'); g.setAttribute('title', 'Library')
    g.innerHTML = COG
    g.addEventListener('click', open)
    document.body.appendChild(g)
  }

  // ── Build one row (matches the demo's .item markup). ──────────────────────
  function itemHTML(m, opts) {
    var cls = m.core ? 'core' : 'mine'
    var lock = opts.locked
    var acts
    if (lock) {
      acts = '<span class="lockedtag">' + IC.lock + 'Locked</span>'
    } else if (opts.onDash) {
      acts = (m.core ? '' : '<button class="a del" data-act="delete" data-id="' + esc(m.id) + '">Delete</button>') +
        '<button class="a sub" data-act="remove" data-id="' + esc(m.id) + '">Remove</button>'
    } else {
      acts = (m.core ? '' : '<button class="a del" data-act="delete" data-id="' + esc(m.id) + '">Delete</button>') +
        '<button class="a add" data-act="add" data-id="' + esc(m.id) + '">Add to dashboard</button>'
    }
    var lockmini = lock ? ' <span class="lockmini">' + IC.lockmini + '</span>' : ''
    return '<div class="item fade" data-state="' + (opts.onDash ? 'dash' : 'lib') + '" data-cat="' + m.cat + '"' +
      (lock ? ' data-locked="1"' : '') + '>' +
      '<div class="cell-name"><div class="art"><span class="tileicon ' + cls + '">' + m.icon + '</span></div>' +
      '<div class="namewrap"><div class="nm">' + esc(m.name) + lockmini + '</div>' +
      '<div class="sublabel">' + esc(m.sub) + '</div></div></div>' +
      '<div class="chip-cell"><span class="chip ' + cls + '">' + (CAT_LABEL[m.cat] || 'Measure') + '</span></div>' +
      '<div class="meta-row"><div class="cell-date">' + esc(opts.date) + '</div>' +
      '<div class="acts">' + acts + '</div></div></div>'
  }

  // ── Render the two lists from the live board. ─────────────────────────────
  var overlay = null
  function render() {
    if (!overlay) return
    var hidden = hiddenList()
    var tiles = registry().map(metaFor)
    var onDash = tiles.filter(function (m) { return hidden.indexOf(m.id) === -1 })
    var inLib = tiles.filter(function (m) { return hidden.indexOf(m.id) !== -1 })

    // dashboard rows = your placed tiles, then the always-on Library row
    var dashHTML = onDash.map(function (m) { return itemHTML(m, { onDash: true, date: dateFor(m) }) }).join('')
    dashHTML += itemHTML({ id: '__library__', name: 'Library', sub: 'Your app manager', cat: 'core', core: true, icon: IC.library },
      { onDash: true, locked: true, date: 'Always on' })
    var libHTML = inLib.map(function (m) { return itemHTML(m, { onDash: false, date: dateFor(m) }) }).join('')

    overlay.querySelector('[data-list="dash"]').innerHTML = dashHTML
    overlay.querySelector('[data-list="lib"]').innerHTML = libHTML
    apply()
  }
  function dateFor(m) { return KNOWN[m.id] ? 'Built in' : 'Added' }

  // ── Filtering / counts / view (adapted from the demo, no search). ─────────
  var activeFilter = 'all'
  function items() { return Array.prototype.slice.call(overlay.querySelectorAll('.item')) }
  function apply() {
    var f = activeFilter, shown = 0
    items().forEach(function (it) {
      var ok = true
      if (f === 'dash') ok = it.getAttribute('data-state') === 'dash'
      else if (f === 'lib') ok = it.getAttribute('data-state') === 'lib'
      else if (f !== 'all') ok = it.getAttribute('data-cat') === f
      it.style.display = ok ? '' : 'none'
      if (ok) shown++
    })
    overlay.querySelectorAll('.seclabel').forEach(function (sec) {
      var st = sec.getAttribute('data-sec')
      var vis = items().filter(function (it) { return it.getAttribute('data-state') === st && it.style.display !== 'none' })
      sec.style.display = vis.length ? '' : 'none'
      var c = sec.querySelector('.c'); if (c) c.textContent = vis.length
    })
    overlay.querySelector('#vlibEmpty').style.display = shown === 0 ? 'block' : 'none'
    // counts
    var totals = { all: 0, dash: 0, lib: 0, core: 0, intake: 0, count: 0, duration: 0, measure: 0 }
    items().forEach(function (it) {
      totals.all++
      var st = it.getAttribute('data-state'); if (st in totals) totals[st]++
      var c = it.getAttribute('data-cat'); if (c in totals) totals[c]++
    })
    overlay.querySelectorAll('[data-count]').forEach(function (el) {
      var k = el.getAttribute('data-count'); el.textContent = (k in totals) ? totals[k] : 0
    })
  }
  function setFilter(f) {
    activeFilter = f
    overlay.querySelectorAll('.nav').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-filter') === f) })
    overlay.querySelectorAll('.mside .pill').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-filter') === f) })
    apply()
  }

  function toast(msg) {
    var t = overlay.querySelector('#vlibToast')
    t.querySelector('span:last-child').textContent = msg
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show')
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show') }, 2200)
  }
  function remount() { if (window.VitalityHost && window.VitalityHost.remount) window.VitalityHost.remount() }

  function act(action, id) {
    if (action === 'remove') { var h = hiddenList(); if (h.indexOf(id) === -1) h.push(id); write({ hidden: h }); render(); remount(); toast('Removed from dashboard') }
    else if (action === 'add') { write({ hidden: hiddenList().filter(function (x) { return x !== id }) }); render(); remount(); toast('Added to your dashboard') }
    else if (action === 'delete') {
      var h2 = hiddenList(); if (h2.indexOf(id) === -1) h2.push(id)
      var d = deletedList(); if (d.indexOf(id) === -1) d.push(id)
      write({ hidden: h2, deleted: d }); render(); remount(); toast('Tile deleted')
    }
  }

  // ── The overlay shell (chrome without search + upload; sidebar; main). ────
  function navBtn(f, icon, label) {
    return '<button class="nav fade" data-filter="' + f + '"><span class="gi">' + icon + '</span><span class="lab">' + label + '</span><span class="cnt" data-count="' + f + '"></span></button>'
  }
  function catBtn(f, label) {
    return '<button class="nav fade" data-filter="' + f + '"><span class="gi"><span class="swatch ' + (f === 'core' ? 'core' : 'mine') + '"></span></span><span class="lab">' + label + '</span><span class="cnt" data-count="' + f + '"></span></button>'
  }
  function pill(f, label) { return '<button class="pill" data-filter="' + f + '">' + label + ' <span class="cnt" data-count="' + f + '"></span></button>' }

  function open() {
    injectStyles()
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'scrim'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', 'Library')
    overlay.innerHTML =
      '<div class="win">' +
        '<div class="chrome">' +
          '<div class="brand"><div class="title"><span class="lock">' + IC.lock + '</span>Library</div></div>' +
          '<div class="toolbar">' +
            '<div class="seg" role="tablist"><button class="on" data-view="list">' + IC.list + 'List</button>' +
            '<button data-view="gallery">' + IC.gallery + 'Gallery</button></div>' +
            '<div class="toolspacer"></div>' +
            '<button class="x" aria-label="Close">' + IC.x + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="body">' +
          '<nav class="side">' +
            '<div class="sgroup"><div class="sglabel">Views</div>' +
              navBtn('all', IC.navAll, 'All tiles').replace('class="nav fade"', 'class="nav on fade"') +
              navBtn('dash', IC.navDash, 'On dashboard') +
              navBtn('lib', IC.navLib, 'In library') +
            '</div>' +
            '<div class="sgroup"><div class="sglabel">Categories</div>' +
              catBtn('core', 'Core') + catBtn('intake', 'Intake') + catBtn('count', 'Count') +
              catBtn('duration', 'Duration') + catBtn('measure', 'Measure') +
            '</div>' +
          '</nav>' +
          '<div class="main" data-view="list">' +
            '<div class="mside">' + pill('all', 'All tiles').replace('class="pill"', 'class="pill on"') +
              pill('dash', 'On dashboard') + pill('lib', 'In library') + pill('core', 'Core') +
              pill('intake', 'Intake') + pill('count', 'Count') + pill('duration', 'Duration') + pill('measure', 'Measure') + '</div>' +
            '<div class="scroller">' +
              '<div class="cols"><span>Name</span><span>Category</span><span>Added</span><span class="right">Actions</span></div>' +
              '<div class="seclabel fade" data-sec="dash"><span class="pip"></span>On your dashboard <span class="c"></span></div>' +
              '<div class="list" data-list="dash"></div>' +
              '<div class="seclabel fade" data-sec="lib"><span class="pip dim"></span>In your library <span class="c"></span></div>' +
              '<div class="list" data-list="lib"></div>' +
              '<div class="empty" id="vlibEmpty"><div class="ei">' + IC.navLib + '</div><div class="et">No tiles here yet</div><div class="eb">Ask your mentor to build a tile, and it shows up here.</div></div>' +
              '<div class="foot"><button class="done">Done</button></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="vtoast" id="vlibToast"><span class="td">' + IC.tick + '</span><span>Done</span></div>'

    document.body.appendChild(overlay)
    render()

    // events
    overlay.querySelector('.x').addEventListener('click', close)
    overlay.querySelector('.done').addEventListener('click', close)
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close() })
    overlay.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        overlay.querySelectorAll('.seg button').forEach(function (x) { x.classList.remove('on') })
        b.classList.add('on')
        overlay.querySelector('.main').setAttribute('data-view', b.getAttribute('data-view'))
      })
    })
    overlay.querySelectorAll('.nav, .mside .pill').forEach(function (el) {
      el.addEventListener('click', function () { setFilter(el.getAttribute('data-filter')) })
    })
    overlay.querySelector('.body').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null
      if (b) act(b.getAttribute('data-act'), b.getAttribute('data-id'))
    })
    document.addEventListener('keydown', onKey)
  }

  function close() {
    if (!overlay) return
    overlay.classList.add('closing')
    document.removeEventListener('keydown', onKey)
    var o = overlay; overlay = null
    setTimeout(function () { if (o && o.parentNode) o.remove() }, 420)
  }
  function onKey(e) { if (e.key === 'Escape') close() }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountGear)
  else mountGear()

  window.VitalityLibrary = { open: open, close: close }
})()
