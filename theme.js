/* ============================================================
 * theme.js — shared theme engine for the Patron / Liam suite.
 *
 * Include this once near the end of <body>:
 *   <script src="theme.js"></script>
 *
 * It wires up the .themeSeg switcher, remembers the choice in
 * localStorage ('patron_theme'), and keeps every open tab in sync.
 * Drop Patron.switcherHtml() into your header and you're done.
 * ============================================================ */
window.Patron = (function () {
  const KEY = 'patron_theme';
  const THEMES = [
    { key: 'nocturne', label: 'Nocturne', swatch: '#8B7CFF' },
    { key: 'aurora',   label: 'Aurora',   swatch: 'linear-gradient(135deg,#8B7BFF,#4FE3D0)' },
    { key: 'daylight', label: 'Daylight', swatch: '#6A45FF' },
  ];

  function current() {
    try { return localStorage.getItem(KEY) || 'nocturne'; } catch (e) { return 'nocturne'; }
  }

  function apply(name) {
    if (!THEMES.some(t => t.key === name)) name = 'nocturne';
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem(KEY, name); } catch (e) {}
    document.querySelectorAll('.themeBtn').forEach(b =>
      b.classList.toggle('themeBtnActive', b.getAttribute('data-theme') === name));
  }

  // HTML for the three-way theme switcher. Paste into your header.
  function switcherHtml() {
    const cur = current();
    return '<div class="themeSeg" role="radiogroup" aria-label="Theme">'
      + THEMES.map(t => '<button type="button" class="themeBtn ' + (t.key === cur ? 'themeBtnActive' : '')
        + '" data-theme="' + t.key + '"><span class="themeSwatch" style="background:' + t.swatch + '"></span>'
        + t.label + '</button>').join('')
      + '</div>';
  }

  // One global click handler covers any .themeBtn on the page.
  document.addEventListener('click', e => {
    const b = e.target.closest('.themeBtn');
    if (b) apply(b.getAttribute('data-theme'));
  });

  // Reflect theme changes made in other tabs.
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) apply(e.newValue);
  });

  apply(current()); // sync the active button on load
  return { THEMES, KEY, current, apply, switcherHtml };
})();
