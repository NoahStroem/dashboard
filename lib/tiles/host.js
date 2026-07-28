/**
 * THE TILE HOST.
 *
 * Ported from Vitality's lib/tiles/useTileHost.ts + lib/tiles/tileStore.ts.
 * It speaks the SAME bridge protocol, byte for byte, on purpose: one tile file
 * runs on this board and on Vitality with no edit. If this host invented its
 * own protocol there would be two incompatible tile formats forever.
 *
 * THE PROTOCOL (do not drift from Vitality's; it is the contract)
 *   tile -> host : { source:'vitality-tile', type:'save',   data }
 *   tile -> host : { source:'vitality-tile', type:'load',   id }
 *   tile -> host : { source:'vitality-tile', type:'report', stream }
 *   host -> tile : { source:'vitality-host', type:'load:result',  id, data }
 *   host -> tile : { source:'vitality-host', type:'save:error',   id, reason }
 *   host -> tile : { source:'vitality-host', type:'report:error', id, reason }
 *
 * THE SEAL. sandbox="allow-scripts" with NO allow-same-origin gives every tile
 * an opaque origin. It can run and it can postMessage its parent. It cannot
 * read this page, the other tiles, the vault, or any key. It has no
 * localStorage of its own (touching it throws), which is exactly why the bridge
 * exists: data reaches a tile through the host or not at all.
 *
 * THE ROUTING. A WeakMap of contentWindow -> tileId. That WindowProxy is a
 * stable reference and it equals event.source for messages that frame posts, so
 * every save/load routes to the tile that actually sent it. This is the fix for
 * a real bug Vitality already hit: a host that closes over ONE key lets any
 * tile's save overwrite whatever the host last pointed at, so two tiles clobber
 * each other. Keyed by window, N tiles never collide.
 *
 * SAVE/LOAD vs REPORT - the two halves, and they are not the same thing:
 *   save/load -> the tile's own private state. Its rows, its settings. Only it
 *                reads this. Lands in the vault slot for its id.
 *   report    -> the tile's ONE honest number for a day. This is the half that
 *                matters to the equation: it lands in the LEDGER, one shape for
 *                every tile, which is what lets the mentor read gym and spend
 *                and revenue in one query and say something true across them.
 *                A reported number is an x in y = Sum of w*x.
 *
 * STORAGE. localStorage for now, one seam (the Store object) to swap. Vitality
 * shipped the same way and for the same reason: Supabase needs a signed-in
 * user, and this board has no auth yet. Swapping this one object to Supabase
 * later touches no tile.
 */
;(function () {
  'use strict'

  // ── Sizes. lib/tiles/tileSkin.ts SIZE_PRESETS, verbatim.
  var SIZE_PRESETS = {
    s:    { cols: 1, rows: 1 },
    m:    { cols: 2, rows: 1 },
    tall: { cols: 1, rows: 2 },
    hero: { cols: 3, rows: 1 },
    big:  { cols: 2, rows: 2 },
    band: { cols: 4, rows: 1 },
    l:    { cols: 4, rows: 2 }
  }

  // Vitality's MAX_TILE_DATA. A cap is why save:error exists: a dropped write
  // must tell the tile, never let it believe it saved.
  var MAX_TILE_DATA = 512 * 1024

  // ── The store. THE SEAM. Swap this object for Supabase; tiles never notice.
  var Store = {
    dataKey: function (id) { return 'v:tile:' + id },
    ledgerKey: 'v:ledger',

    loadData: function (id) {
      try {
        var raw = window.localStorage.getItem(Store.dataKey(id))
        return raw ? JSON.parse(raw) : null // null on first run, per the contract
      } catch (e) {
        return null
      }
    },

    saveData: function (id, data) {
      try {
        var json = JSON.stringify(data)
        if (json.length > MAX_TILE_DATA) return false
        window.localStorage.setItem(Store.dataKey(id), json)
        return true
      } catch (e) {
        return false // quota, private mode, anything. The tile gets told.
      }
    },

    /**
     * One ledger row per reported day, per stream. Re-reporting the same
     * key+date REPLACES that day rather than appending a second row, because a
     * tile reports "today's value is now 3" every time the user taps, not "add
     * 3". Appending would make one glass of water read as six.
     */
    appendLedger: function (tileId, stream) {
      if (!stream || typeof stream !== 'object') return false
      var value = Number(stream.value)
      if (!isFinite(value)) return false
      var key = String(stream.key || '').trim()
      var date = String(stream.date || '').trim()
      if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

      try {
        var rows = []
        try { rows = JSON.parse(window.localStorage.getItem(Store.ledgerKey) || '[]') } catch (e) { rows = [] }
        if (!Array.isArray(rows)) rows = []

        var row = {
          key: key,
          label: typeof stream.label === 'string' ? stream.label : key,
          value: value,
          date: date,
          kind: typeof stream.kind === 'string' ? stream.kind : 'measure',
          goalDirection: stream.goalDirection === 'up' || stream.goalDirection === 'down' ? stream.goalDirection : 'neutral',
          tile: tileId,
          source: 'manual', // a human tapped a tile. the mentor writes 'auto'.
          logged: new Date().toISOString()
        }

        var at = -1
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].key === key && rows[i].date === date) { at = i; break }
        }
        if (at >= 0) rows[at] = row; else rows.push(row)

        window.localStorage.setItem(Store.ledgerKey, JSON.stringify(rows))
        return true
      } catch (e) {
        return false
      }
    },

    readLedger: function () {
      try {
        var rows = JSON.parse(window.localStorage.getItem(Store.ledgerKey) || '[]')
        return Array.isArray(rows) ? rows : []
      } catch (e) {
        return []
      }
    }
  }

  // ── The routing map. contentWindow -> tileId.
  var reg = new WeakMap()

  function register(win, tileId) { if (win) reg.set(win, tileId) }
  function unregister(win) { if (win) reg.delete(win) }

  // ── The feed. A registry entry may declare `data: 'tiles/data/x.json'`: a
  //    file in THIS repo that automation (the mentor, a scheduled routine)
  //    writes and pushes. The HOST fetches it - a sealed tile cannot fetch -
  //    and hands it to the tile as {type:'feed'}. This is how automated data
  //    reaches a sealed tile: through git, through the host, never a key in
  //    the tile. A missing file is a normal day-one state, not an error.
  var feeds = {}      // tileId -> parsed json
  var tileFrames = {} // tileId -> [iframe], every live instance (grid + page)

  function pushFeed(tileId) {
    var data = feeds[tileId]
    if (data == null) return
    ;(tileFrames[tileId] || []).forEach(function (f) {
      if (f.contentWindow) f.contentWindow.postMessage({ source: 'vitality-host', type: 'feed', data: data }, '*')
    })
  }

  function fetchFeed(t) {
    fetch(t.data, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (j) { if (j != null) { feeds[t.id] = j; pushFeed(t.id) } })
      .catch(function () {}) // no feed yet. the tile renders its empty states.
  }

  // ── Host chrome styles, injected here so adding page/feed support to a board
  //    is a ONE-file update (this file), never an index.html edit.
  function injectStyles() {
    if (document.getElementById('vHostStyles')) return
    var s = document.createElement('style')
    s.id = 'vHostStyles'
    s.textContent =
      '.tile{position:relative}' +
      '.tileHit{position:absolute;inset:0;z-index:7;background:transparent;border:0;padding:0;cursor:pointer}' +
      '.tileHit:focus-visible{outline:2px solid rgba(110,231,183,.6);outline-offset:-2px;border-radius:20px}' +
      '.vPage{position:fixed;inset:0;z-index:60;background:#000}' +
      '.vPage iframe{display:block;width:100%;height:100%;border:0;color-scheme:normal}' +
      '.vPageClose{position:fixed;top:14px;right:16px;z-index:61;width:36px;height:36px;border-radius:999px;' +
      'border:1px solid rgba(255,255,255,.16);background:rgba(9,13,12,.72);color:#E7ECEA;font-size:16px;' +
      'line-height:1;cursor:pointer}' +
      '.vPageClose:hover{border-color:rgba(110,231,183,.5)}'
    document.head.appendChild(s)
  }

  // ── The full page. A registry entry with `page: true` renders its face in
  //    the grid and opens the SAME file full screen on tap, with '#page' in
  //    the URL so the file knows which of its two layers to show. A hash, not
  //    a query: static hosts that redirect clean URLs drop the query string,
  //    and browsers carry the fragment through the redirect.
  //    The page frame is sealed exactly like the grid frame, registered under
  //    the same id, so both instances share one vault slot.
  function openPage(t) {
    injectStyles()
    var wrap = document.createElement('div')
    wrap.className = 'vPage'

    var frame = document.createElement('iframe')
    frame.title = (t.name || t.id)
    frame.setAttribute('sandbox', 'allow-scripts')

    var close = document.createElement('button')
    close.className = 'vPageClose'
    close.textContent = '×'
    close.setAttribute('aria-label', 'Close')

    function onKey(e) { if (e.key === 'Escape') shut() }
    function shut() {
      unregister(frame.contentWindow)
      var list = tileFrames[t.id] || []
      var at = list.indexOf(frame)
      if (at >= 0) list.splice(at, 1)
      document.removeEventListener('keydown', onKey)
      wrap.remove()
      close.remove()
    }
    close.addEventListener('click', shut)
    document.addEventListener('keydown', onKey)

    wrap.appendChild(frame)
    document.body.appendChild(wrap)
    document.body.appendChild(close)
    register(frame.contentWindow, t.id)
    ;(tileFrames[t.id] = tileFrames[t.id] || []).push(frame)
    frame.src = t.file + '#page'
  }

  // ── The listener. One for the page, routed by sender.
  window.addEventListener('message', function (e) {
    var msg = e.data
    if (!msg || msg.source !== 'vitality-tile') return

    var src = e.source
    if (!src) return

    // The sender is verified by identity (is this window one we rendered?),
    // never by anything the message claims. A tile cannot name another tile.
    var tileId = reg.get(src)
    if (!tileId) return

    // targetOrigin stays '*' because a sealed tile's origin is opaque ("null")
    // and cannot be named. The sender is already verified via e.source, and the
    // payload is the tile's own data going back to it.
    if (msg.type === 'save') {
      var ok = Store.saveData(tileId, msg.data)
      if (!ok) {
        src.postMessage({ source: 'vitality-host', type: 'save:error', id: msg.id, reason: 'too_large_or_full' }, '*')
      }
      return
    }

    if (msg.type === 'load') {
      var data = Store.loadData(tileId)
      src.postMessage({ source: 'vitality-host', type: 'load:result', id: msg.id, data: data }, '*')
      // A loading tile is a listening tile: hand it the feed right behind its
      // own data, so the automation's news/quotes are there on first paint.
      if (feeds[tileId] != null) {
        src.postMessage({ source: 'vitality-host', type: 'feed', data: feeds[tileId] }, '*')
      }
      return
    }

    if (msg.type === 'report') {
      var landed = Store.appendLedger(tileId, msg.stream)
      if (!landed) {
        // Honesty: a report that did not land must never be counted. The tile
        // shows an amber note instead of celebrating a write that never was.
        src.postMessage({ source: 'vitality-host', type: 'report:error', id: msg.id, reason: 'rejected' }, '*')
      }
      return
    }
  })

  // ── The board layer. The Library (lib/tiles/library.js) can hide a tile
  //    without editing the registry: it writes v:board.hidden and calls
  //    remount(). mount() honours it so a hidden tile never renders. No Library
  //    on the board means no key, means nothing hidden - a no-op on a bare seed.
  function boardHidden() {
    // Only honour hidden state while the Library is actually loaded. Remove the
    // library.js <script> and window.VitalityLibrary is gone, so the host stops
    // filtering and every registry tile renders again. That keeps the promise
    // ("delete one line and the board is the bare seed") true, and never strands
    // a tile someone hid before the Library was removed.
    if (!window.VitalityLibrary) return []
    try {
      var b = JSON.parse(window.localStorage.getItem('v:board') || '{}')
      return b && Array.isArray(b.hidden) ? b.hidden : []
    } catch (e) {
      return []
    }
  }

  // ── Render. Empty registry renders nothing at all, so the seed board is
  //    exactly the shell: the gem, the name, the date.
  function mount() {
    var grid = document.getElementById('tileGrid')
    if (!grid) return

    // Clear any prior render. On first mount this is a no-op; remount() relies
    // on it so toggling a tile never stacks a second copy of the survivors.
    grid.innerHTML = ''

    var hidden = boardHidden()
    var tiles = (Array.isArray(window.TILES) ? window.TILES : []).filter(function (t) {
      return t && hidden.indexOf(t.id) === -1
    })
    if (!tiles.length) { grid.hidden = true; return }
    grid.hidden = false

    var seen = {}
    tiles.forEach(function (t) {
      if (!t || !t.id || !t.file) return
      if (seen[t.id]) {
        // Two tiles on one id would share one storage slot and silently
        // overwrite each other. Say so; never render the collision.
        console.warn('[host] duplicate tile id "' + t.id + '" ignored. ids are storage keys and must be unique.')
        return
      }
      seen[t.id] = true

      var span = SIZE_PRESETS[t.size] || SIZE_PRESETS.m

      var card = document.createElement('div')
      card.className = 'tile'
      card.style.setProperty('--cols', span.cols)
      card.style.setProperty('--rows', span.rows)

      var frame = document.createElement('iframe')
      frame.className = 'tileFrame'
      frame.title = t.name || t.id
      frame.setAttribute('sandbox', 'allow-scripts') // NO allow-same-origin. the seal.

      // ORDER IS LOAD-BEARING. Attach first, register second, set src LAST.
      //
      // Registering in the frame's onload looks natural and is a 3 second bug:
      // the tile's script runs (and calls Vitality.load()) BEFORE its frame's
      // load event fires, so the host sees an unregistered sender, drops that
      // first ask on the floor, and the tile sits blank until the bridge's 3s
      // retry rescues it. Every tile would flash empty on every boot.
      //
      // Attaching to the document gives the frame a contentWindow immediately
      // (about:blank). That WindowProxy is a STABLE reference: it survives the
      // navigation to t.file and still equals event.source for messages the
      // loaded tile posts. So binding it now binds it correctly, forever, and
      // the tile's very first ask is already routable.
      //
      // No 'loading=lazy' for the same reason: a deferred frame has no
      // contentWindow to bind, and a tile below the fold would silently never
      // register.
      card.appendChild(frame)
      grid.appendChild(card)
      register(frame.contentWindow, t.id)
      ;(tileFrames[t.id] = tileFrames[t.id] || []).push(frame)
      frame.src = t.file

      // page: true - the grid face is a poster; tapping opens the full page.
      // The catcher sits ABOVE the iframe (which would otherwise swallow the
      // click), so the tap target is the whole card, host-side, like the app.
      if (t.page) {
        injectStyles()
        var hit = document.createElement('button')
        hit.className = 'tileHit'
        hit.setAttribute('aria-label', 'Open ' + (t.name || t.id))
        hit.addEventListener('click', function () { openPage(t) })
        card.appendChild(hit)
      }

      if (t.data) fetchFeed(t)
    })
  }

  // Redraw the grid from the (possibly newly filtered) registry. The Library
  // calls this after hiding or showing a tile. Drop the frame handles first so a
  // hidden tile's old frame stops being tracked; its detached iframe is GC'd
  // once mount() clears the grid.
  function remount() {
    tileFrames = {}
    mount()
  }

  // Read-only handles for the mentor and for tests. Not a tile API: a tile is
  // sealed and can never reach any of this.
  window.VitalityHost = {
    mount: mount,
    remount: remount,
    register: register,
    unregister: unregister,
    store: Store,
    ledger: Store.readLedger,
    SIZE_PRESETS: SIZE_PRESETS
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
