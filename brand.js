/* ============================================================
 * brand.js — the suite wordmark = the CURRENT USER'S name.
 *
 * Every page ships with the literal wordmark "Liam" (titles, the
 * "← back" links, the live tickers, aria-labels). This swaps that
 * wordmark for the name saved in the onboarding profile
 * (patron_profile_v1), falling back to "Dashboard" until one is set.
 *
 * It runs on load AND re-applies after the page's own JS re-renders
 * (via a MutationObserver), so JS-built markup stays branded too.
 * If the user's name actually IS "Liam", it's a no-op.
 *
 * Include once per page, anywhere after <body> opens (we add it last).
 * ============================================================ */
(function () {
  var WORDMARK = 'Liam'; // the literal baked into every page's markup
  function brand() {
    try {
      var p = JSON.parse(localStorage.getItem('patron_profile_v1') || 'null');
      var n = (p && p.name) ? String(p.name).trim() : '';
      return n || 'Dashboard';
    } catch (e) { return 'Dashboard'; }
  }

  var mo = null;
  function patch() {
    var b = brand();
    if (b === WORDMARK) return; // already correct — nothing to do
    var re = new RegExp(WORDMARK, 'g');

    // 1) visible text nodes (skip script/style/inputs so we never touch code)
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        return (node.nodeValue && node.nodeValue.indexOf(WORDMARK) >= 0)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var hits = [], n;
    while ((n = walker.nextNode())) hits.push(n);
    hits.forEach(function (t) { t.nodeValue = t.nodeValue.replace(re, b); });

    // 2) aria-labels that name the wordmark
    var labelled = document.querySelectorAll('[aria-label*="' + WORDMARK + '"]');
    for (var i = 0; i < labelled.length; i++) {
      labelled[i].setAttribute('aria-label', labelled[i].getAttribute('aria-label').replace(re, b));
    }

    // 3) the document title
    if (document.title.indexOf(WORDMARK) >= 0) document.title = document.title.replace(re, b);
  }

  // Patch with the observer paused so our own edits don't retrigger us.
  function run() {
    if (mo) mo.disconnect();
    try { patch(); } catch (e) {}
    if (mo && document.body) mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function start() {
    mo = new MutationObserver(run);
    run();
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);

  // Name changed in another tab / after sync → re-brand.
  window.addEventListener('storage', function (e) {
    if (e.key === 'patron_profile_v1' || e.key === null) run();
  });
})();
