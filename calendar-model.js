/* ============================================================
 * calendar-model.js — the Calendar's data model + storage layer.
 *
 * Two records, one file. Everything that knows the SHAPE of a calendar
 * entry lives here; calendar.html and the hub tile only render what this
 * hands them. Swapping localStorage for a real backend (or a CalDAV /
 * Google Calendar sync) means reimplementing CalendarStore's six methods —
 * nothing above it changes.
 *
 *   CalendarModel — pure functions. No I/O, no localStorage, no DOM.
 *   CalendarStore — persistence. The only part that touches storage.
 *
 * ---- Why every record carries an `id` ----
 *
 * sync-merge.js unions lists BY IDENTITY, and picks the identity field by
 * trying ['id','uid','dateKey','ts'] and taking the first one present on
 * EVERY element. If a single record ever ships without an `id`, identity
 * silently falls through to `dateKey` — and two events on the same day
 * collapse into one. That is data loss, and it is quiet.
 *
 * So `id` is not optional and not lazily assigned: normalize() stamps one
 * on anything that arrives without it, and save() refuses a record that
 * somehow still lacks one. Everything else in this file is negotiable.
 *
 * ---- Why times are local wall-clock strings ----
 *
 * A start time is stored as 'YYYY-MM-DDTHH:mm' (or 'YYYY-MM-DD' for an
 * all-day entry) — the exact format <input type="datetime-local"> and
 * <input type="date"> read and write, so the forms need no conversion.
 * It also sorts correctly as a plain string, and matches the suite's
 * existing localDateKey() convention.
 *
 * The tradeoff, stated plainly: these are wall-clock times with no
 * timezone. "09:00" means 09:00 on whatever device you're reading it on.
 * For a personal dashboard that is the behaviour you want — a 09:00 dentist
 * appointment shouldn't become 08:00 because you opened your laptop in
 * London. If real timezone support is ever needed, add a `tz` field and
 * convert at the edges; the storage format survives that.
 * ============================================================ */
(function (global) {
  'use strict';

  /* ============================================================
   * CONSTANTS
   * ============================================================ */

  var EVENTS_KEY = 'calendar_events_v1';
  var REMINDERS_KEY = 'calendar_reminders_v1';
  var SCHEMA = 1;

  /* Repeat rules. Stored as a rule, never expanded into storage — see
   * occurrencesOf(). A year of daily reminders is 365 rows you'd have to
   * write, merge and garbage-collect; it's one row and a rule instead. */
  var REPEATS = ['daily', 'weekly', 'monthly'];

  /* Category tags. Desaturated on purpose: these sit on the suite's black
   * canvas next to mint, and saturated tags would out-shout the content.
   * `color` is a literal because a category's colour must survive being
   * read by the hub tile, which has a different token set than the page. */
  var CATEGORIES = [
    { id: 'health', label: 'Health', color: '#6EE7B7' },
    { id: 'work',   label: 'Work',   color: '#8B7CFF' },
    { id: 'social', label: 'Social', color: '#F0A6C8' },
    { id: 'money',  label: 'Money',  color: '#F5C451' },
    { id: 'admin',  label: 'Admin',  color: '#7FC7E8' }
  ];

  /* The completion key used by a reminder that has no due date — it can only
   * ever be done once, so it needs exactly one slot. See isCompleted(). */
  var ONCE = 'once';

  /* ============================================================
   * TIME — all local, all wall-clock
   * ============================================================ */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* 'YYYY-MM-DD' for a Date, in LOCAL time. Mirrors localDateKey() in
   * index.html — deliberately not toISOString(), which is UTC and rolls
   * the date over at the wrong moment for anyone east or west of London. */
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function timeStamp(d) {
    d = d || new Date();
    return dateKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* A stamp is all-day if it carries no time component. */
  function isAllDayStamp(s) { return typeof s === 'string' && s.length === 10; }

  function keyOf(stamp) {
    return typeof stamp === 'string' ? stamp.slice(0, 10) : null;
  }

  /* Parse a stored stamp into a real Date in local time.
   * new Date('2026-08-18') would parse as UTC midnight; new Date(y,m,d)
   * does not. An all-day entry resolves to 00:00 local on its day. */
  function parseStamp(stamp) {
    if (typeof stamp !== 'string' || stamp.length < 10) return null;
    var y = +stamp.slice(0, 4), mo = +stamp.slice(5, 7), da = +stamp.slice(8, 10);
    if (!isFinite(y) || !isFinite(mo) || !isFinite(da)) return null;
    var h = 0, mi = 0;
    if (stamp.length >= 16) {
      h = +stamp.slice(11, 13);
      mi = +stamp.slice(14, 16);
      if (!isFinite(h) || !isFinite(mi)) { h = 0; mi = 0; }
    }
    var d = new Date(y, mo - 1, da, h, mi, 0, 0);
    return isFinite(d.getTime()) ? d : null;
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /* Whole days between two dates, ignoring the clock — so "tomorrow" is
   * tomorrow at 00:05 as much as at 23:55. */
  function dayDelta(from, to) {
    return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
  }

  /* Days remaining in the current week. Monday-start (weekStartsOn = 1),
   * which is the convention where this dashboard is used; pass 0 for
   * Sunday-start. Returns how many days from `d` until the week ends. */
  function daysLeftInWeek(d, weekStartsOn) {
    var start = weekStartsOn == null ? 1 : weekStartsOn;
    var dow = (d.getDay() - start + 7) % 7;   // 0 = first day of week
    return 6 - dow;
  }

  /* ============================================================
   * IDENTITY
   * ============================================================ */

  function uuid(prefix) {
    var raw;
    try {
      if (global.crypto && global.crypto.randomUUID) raw = global.crypto.randomUUID();
    } catch (_) {}
    if (!raw) {
      raw = Date.now().toString(36) + '-' +
            Math.random().toString(36).slice(2, 10) +
            Math.random().toString(36).slice(2, 6);
    }
    return prefix + '_' + raw;
  }

  /* ============================================================
   * RECORDS
   *
   * Event    — something that happens at a time. Read-mostly.
   * Reminder — something you need to do. Completable, optionally repeating.
   *
   * Both carry `ts` (created) and `updatedAt` (last edit) because
   * sync-merge.js reads them: `ts` gives merged lists a stable sort order
   * across devices, and per-field conflicts fall back to newest-wins.
   * ============================================================ */

  function makeEvent(o) {
    o = o || {};
    var now = Date.now();
    var start = o.start || timeStamp();
    var source = o.source === 'google' ? 'google' : 'local';
    return {
      id: o.id || uuid('evt'),
      kind: 'event',
      title: str(o.title),
      start: start,
      end: o.end || null,               // null = no explicit end
      allDay: o.allDay != null ? !!o.allDay : isAllDayStamp(start),
      category: categoryId(o.category),
      note: str(o.note),
      /* Provenance. 'local' is anything you typed here; 'google' is mirrored
       * from a connected calendar and lives in a separate, non-synced store —
       * it never enters calendar_events_v1, so a sync cannot overwrite or
       * delete anything you created. An older record with no `source` reads
       * back as 'local', which is what it is. */
      source: source,
      externalId: o.externalId || null,   // the provider's id, for dedupe
      calendarId: o.calendarId || null,
      htmlLink: o.htmlLink || null,
      /* Mirrored events are read-only until write scope is added. The UI shows
       * this rather than letting an edit fail after the fact. */
      readOnly: source === 'google' ? true : !!o.readOnly,
      ts: num(o.ts, now),
      updatedAt: num(o.updatedAt, now)
    };
  }

  function makeReminder(o) {
    o = o || {};
    var now = Date.now();
    return {
      id: o.id || uuid('rem'),
      kind: 'reminder',
      title: str(o.title),
      due: o.due || null,               // null = someday, no date
      repeat: REPEATS.indexOf(o.repeat) >= 0 ? o.repeat : null,
      category: categoryId(o.category),
      note: str(o.note),
      /* dateKey -> completion timestamp. One map covers every case:
       * a repeating reminder gets one entry per occurrence it completed,
       * a dated one-off gets one entry under its due date, and an undated
       * one-off gets one under ONCE. A map is also the shape sync-merge.js
       * handles best — two devices ticking two different days both keep
       * their tick, instead of one overwriting the other. */
      completed: obj(o.completed),
      ts: num(o.ts, now),
      updatedAt: num(o.updatedAt, now)
    };
  }

  function str(v) { return v == null ? '' : String(v); }
  function num(v, dflt) { var n = Number(v); return isFinite(n) ? n : dflt; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  function categoryId(v) {
    if (!v) return null;
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === v) return v;
    return null;
  }

  function category(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  /* Re-run a record through its factory. Anything malformed — a record from
   * an older shape, a hand-edited localStorage value, a half-merged object —
   * comes back valid, with an id. Cheap, so it runs on every read. */
  function normalize(rec) {
    if (!rec || typeof rec !== 'object') return null;
    return rec.kind === 'reminder' ? makeReminder(rec) : makeEvent(rec);
  }

  /* ============================================================
   * COMPLETION
   * ============================================================ */

  function completionKey(rem, occurrenceKey) {
    if (occurrenceKey) return occurrenceKey;
    if (rem.due) return keyOf(rem.due);
    return ONCE;
  }

  function isCompleted(rem, occurrenceKey) {
    return !!rem.completed[completionKey(rem, occurrenceKey)];
  }

  /* Returns a NEW reminder — never mutates. The caller saves it. */
  function setCompleted(rem, occurrenceKey, done) {
    var next = makeReminder(rem);
    var k = completionKey(rem, occurrenceKey);
    next.completed = obj(JSON.parse(JSON.stringify(rem.completed)));
    if (done) next.completed[k] = Date.now();
    else delete next.completed[k];
    next.updatedAt = Date.now();
    return next;
  }

  /* ============================================================
   * OCCURRENCES
   *
   * A repeating reminder is one record. This turns it into the concrete
   * dates it lands on inside a window, at render time. Nothing here writes.
   * ============================================================ */

  function nextOccurrenceDate(base, repeat, n) {
    var d = new Date(base.getTime());
    if (repeat === 'daily') d.setDate(d.getDate() + n);
    else if (repeat === 'weekly') d.setDate(d.getDate() + n * 7);
    else if (repeat === 'monthly') {
      /* setMonth clamps: the 31st + 1 month lands on the 3rd of the month
       * after next for short months. Pin the day back to the last valid one
       * so a "31st monthly" reminder stays at month-end instead of drifting. */
      var day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
    }
    return d;
  }

  /* All occurrences of one reminder within [from, to], as flat rows.
   * A non-repeating reminder yields at most one. An undated reminder yields
   * one undated row, so "someday" items still surface in a list. */
  function occurrencesOf(rem, from, to, opts) {
    opts = opts || {};
    var out = [];
    var includeDone = !!opts.includeCompleted;

    /* Snap the window to whole days. Callers think in days ("the next two
     * weeks") and naturally pass midnight for both ends — which would drop
     * every occurrence later in `to`'s own day. Widening here means the
     * window means what it looks like it means; it is a no-op for a caller
     * that already passed day boundaries. */
    from = startOfDay(from);
    to = endOfDayOf(to);

    if (!rem.due) {
      if (includeDone || !isCompleted(rem, null)) {
        out.push(row(rem, null, null));
      }
      return out;
    }

    var first = parseStamp(rem.due);
    if (!first) return out;

    if (!rem.repeat) {
      /* A one-off stays visible before its due date and after it — an
       * overdue reminder that scrolled out of the window is exactly the
       * one you most need to see, so it is never filtered out by `from`. */
      if (first <= to && (includeDone || !isCompleted(rem, null))) {
        out.push(row(rem, keyOf(rem.due), first));
      }
      return out;
    }

    /* Repeating. Walk from the first occurrence; guard the loop hard so a
     * corrupt rule can never spin. 400 covers a year of dailies. */
    var LIMIT = 400;
    for (var n = 0; n < LIMIT; n++) {
      var d = nextOccurrenceDate(first, rem.repeat, n);
      if (d > to) break;
      if (d < from) continue;
      var k = dateKey(d);
      if (includeDone || !rem.completed[k]) out.push(row(rem, k, d));
    }
    return out;

    function row(r, occKey, when) {
      return {
        kind: 'reminder',
        id: r.id,
        occurrenceKey: occKey,
        reminder: r,
        title: r.title,
        category: r.category,
        when: when,                                   // Date, or null if undated
        allDay: r.due ? isAllDayStamp(r.due) : true,
        completed: isCompleted(r, occKey),
        repeat: r.repeat
      };
    }
  }

  function eventRow(evt) {
    return {
      kind: 'event',
      id: evt.id,
      occurrenceKey: keyOf(evt.start),
      event: evt,
      title: evt.title,
      category: evt.category,
      when: parseStamp(evt.start),
      end: evt.end ? parseStamp(evt.end) : null,
      allDay: evt.allDay,
      completed: false,
      repeat: null
    };
  }

  /* ============================================================
   * THE UPCOMING FEED
   * ============================================================ */

  /* Everything happening between now and `days` out, soonest first, as one
   * merged stream of events and reminder occurrences.
   *
   * Undated reminders sort last — they have no time to sort by, and putting
   * them at the top would bury the things that actually have a deadline.
   *
   * `maxPerSeries` caps how many occurrences ONE repeating reminder may
   * contribute, and defaults to 1. This is the difference between a usable
   * list and an unusable one: a daily reminder over a 30-day window is 30
   * identical rows that bury everything else. What you want from "coming up"
   * is the next time each thing is due — tick it off and the one after it
   * takes its place. Pass a bigger number for a full agenda view. */
  function upcoming(events, reminders, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var days = opts.days == null ? 30 : opts.days;
    var maxPerSeries = opts.maxPerSeries == null ? 1 : opts.maxPerSeries;
    var from = startOfDay(now);
    var to = addDays(startOfDay(now), days);
    to.setHours(23, 59, 59, 999);

    var rows = [];
    var i;

    for (i = 0; i < events.length; i++) {
      var r = eventRow(events[i]);
      if (!r.when) continue;
      /* An all-day event counts as current for the whole day; a timed one
       * drops off the feed once its end (or its start) has passed. */
      var cutoff = r.allDay ? endOfDayOf(r.when) : (r.end || r.when);
      if (cutoff < now || r.when > to) continue;
      rows.push(r);
    }

    for (i = 0; i < reminders.length; i++) {
      /* occurrencesOf returns them in date order, so the head of the list is
       * the soonest — including an overdue one, which outranks the next
       * scheduled occurrence and should be what you see. */
      var occs = occurrencesOf(reminders[i], from, to, opts);
      if (maxPerSeries > 0) occs = occs.slice(0, maxPerSeries);
      for (var j = 0; j < occs.length; j++) rows.push(occs[j]);
    }

    rows.sort(function (a, b) {
      if (!a.when && !b.when) return a.title < b.title ? -1 : 1;
      if (!a.when) return 1;
      if (!b.when) return -1;
      var d = a.when.getTime() - b.when.getTime();
      if (d) return d;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
    return rows;
  }

  function endOfDayOf(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  /* Today / Tomorrow / This week / Later — plus Overdue, which has to come
   * first because a missed reminder is the one thing you want at the top. */
  function groupUpcoming(rows, now, weekStartsOn) {
    now = now || new Date();
    var buckets = [
      { id: 'overdue',  label: 'Overdue',   items: [] },
      { id: 'today',    label: 'Today',     items: [] },
      { id: 'tomorrow', label: 'Tomorrow',  items: [] },
      { id: 'week',     label: 'This week', items: [] },
      { id: 'later',    label: 'Later',     items: [] },
      { id: 'someday',  label: 'Someday',   items: [] }
    ];
    var byId = {};
    for (var i = 0; i < buckets.length; i++) byId[buckets[i].id] = buckets[i];
    var weekEdge = daysLeftInWeek(now, weekStartsOn);

    for (i = 0; i < rows.length; i++) {
      byId[bucketFor(rows[i], now, weekEdge)].items.push(rows[i]);
    }
    return buckets.filter(function (b) { return b.items.length > 0; });
  }

  function bucketFor(row, now, weekEdge) {
    if (!row.when) return 'someday';
    if (isOverdue(row, now)) return 'overdue';
    var delta = dayDelta(now, row.when);
    if (delta <= 0) return 'today';
    if (delta === 1) return 'tomorrow';
    if (delta <= weekEdge) return 'week';
    return 'later';
  }

  /* Only a reminder can be overdue — an event you didn't go to isn't a task,
   * and flagging it red every morning would be noise. */
  function isOverdue(row, now) {
    now = now || new Date();
    if (row.kind !== 'reminder' || row.completed || !row.when) return false;
    return (row.allDay ? endOfDayOf(row.when) : row.when) < now;
  }

  /* ============================================================
   * RELATIVE TIME
   * ============================================================ */

  /* "in 2 hours", "in 3 days", "20 min ago". Day-based above 24h so it
   * agrees with the Today / Tomorrow grouping instead of contradicting it
   * ("in 20 hours" sitting under a "Tomorrow" heading reads as a bug). */
  function relativeTime(when, now, allDay) {
    if (!when) return '';
    now = now || new Date();
    var delta = dayDelta(now, when);

    if (allDay || Math.abs(when.getTime() - now.getTime()) >= 86400000 || delta !== 0) {
      if (delta === 0) return allDay ? 'today' : null2rel(when, now);
      if (delta === 1) return 'tomorrow';
      if (delta === -1) return 'yesterday';
      if (delta > 1) return delta < 7 ? 'in ' + delta + ' days'
                   : delta < 14 ? 'in a week'
                   : delta < 31 ? 'in ' + Math.round(delta / 7) + ' weeks'
                   : 'in ' + Math.round(delta / 30) + ' month' + (Math.round(delta / 30) === 1 ? '' : 's');
      var ago = -delta;
      return ago < 7 ? ago + ' days ago'
           : ago < 14 ? 'a week ago'
           : ago < 31 ? Math.round(ago / 7) + ' weeks ago'
           : Math.round(ago / 30) + ' month' + (Math.round(ago / 30) === 1 ? '' : 's') + ' ago';
    }
    return null2rel(when, now);
  }

  function null2rel(when, now) {
    var mins = Math.round((when.getTime() - now.getTime()) / 60000);
    var future = mins >= 0;
    var m = Math.abs(mins);
    var text;
    if (m < 1) text = 'now';
    else if (m < 60) text = m + ' min';
    else {
      var h = Math.floor(m / 60), rem = m % 60;
      text = h + (rem >= 30 ? '.5' : '') + ' hour' + (h === 1 && rem < 30 ? '' : 's');
    }
    if (text === 'now') return 'now';
    return future ? 'in ' + text : text + ' ago';
  }

  /* '09:00' — or nothing at all for an all-day entry. */
  function clockLabel(when, allDay) {
    if (!when || allDay) return '';
    return pad(when.getHours()) + ':' + pad(when.getMinutes());
  }

  /* ============================================================
   * CalendarStore — the ONLY part that touches storage.
   *
   * Reads never write. That is the suite's hardest-won rule: a page that
   * rewrites storage while it boots looks, to the sync engine, exactly like
   * an edit you just made — and being newest it wins, so a laptop that has
   * been closed for two days overwrites what your phone saved. So load()
   * repairs what it reads in memory and hands it back; it never saves the
   * repair. See sync-boot.js and HOW_TO_ADD_A_PAGE.md.
   * ============================================================ */

  var Store = {
    EVENTS_KEY: EVENTS_KEY,
    REMINDERS_KEY: REMINDERS_KEY,

    loadEvents: function () { return readList(EVENTS_KEY); },
    loadReminders: function () { return readList(REMINDERS_KEY); },

    saveEvent: function (evt) { return upsert(EVENTS_KEY, makeEvent(evt)); },
    saveReminder: function (rem) { return upsert(REMINDERS_KEY, makeReminder(rem)); },

    removeEvent: function (id) { return removeFrom(EVENTS_KEY, id); },
    removeReminder: function (id) { return removeFrom(REMINDERS_KEY, id); },

    /* Re-render when another device changes something, instead of letting
     * the engine fall back to reloading the whole page. */
    onChange: function (fn) {
      try {
        if (global.PatronDB && global.PatronDB.onChange) return global.PatronDB.onChange(fn);
      } catch (_) {}
      return function () {};
    }
  };

  function readList(key) {
    var raw = null;
    try { raw = global.localStorage.getItem(key); } catch (_) { return []; }
    if (!raw) return [];
    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return []; }

    /* Accept both the wrapped shape and a bare array — a merge that ran
     * against an empty side can hand back either, and a stored value is
     * never worth throwing away over its envelope. */
    var items = Array.isArray(parsed) ? parsed
              : (parsed && Array.isArray(parsed.items)) ? parsed.items
              : [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var rec = normalize(items[i]);
      if (rec) out.push(rec);
    }
    return out;
  }

  /* Writes go through PatronDB.write when it's loaded, which tags them as a
   * real user edit for the sync engine. Falling back to setItem still syncs
   * — sync-boot.js wraps setItem itself — it just can't state intent. */
  function writeList(key, items) {
    var payload = JSON.stringify({ v: SCHEMA, items: items });
    try {
      if (global.PatronDB && global.PatronDB.write) global.PatronDB.write(key, payload);
      else global.localStorage.setItem(key, payload);
    } catch (_) {}
    return items;
  }

  function upsert(key, rec) {
    if (!rec.id) throw new Error('calendar: refusing to save a record with no id');
    var items = readList(key);
    var replaced = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === rec.id) { items[i] = rec; replaced = true; break; }
    }
    if (!replaced) items.push(rec);
    writeList(key, items);
    return rec;
  }

  function removeFrom(key, id) {
    var items = readList(key), out = [];
    for (var i = 0; i < items.length; i++) if (items[i].id !== id) out.push(items[i]);
    /* The whole list stays under one key, so a delete is a write of the
     * remaining items — not PatronDB.remove(), which would drop the key
     * itself and take the other records with it. sync-merge.js reads the
     * gap against the base version and propagates the single deletion. */
    writeList(key, out);
    return out;
  }

  /* ============================================================
   * EXPORTS
   * ============================================================ */

  global.CalendarModel = {
    // constants
    EVENTS_KEY: EVENTS_KEY,
    REMINDERS_KEY: REMINDERS_KEY,
    SCHEMA: SCHEMA,
    REPEATS: REPEATS,
    CATEGORIES: CATEGORIES,
    ONCE: ONCE,

    // records
    makeEvent: makeEvent,
    makeReminder: makeReminder,
    normalize: normalize,
    category: category,

    // completion
    isCompleted: isCompleted,
    setCompleted: setCompleted,
    completionKey: completionKey,

    // feed
    occurrencesOf: occurrencesOf,
    eventRow: eventRow,
    upcoming: upcoming,
    groupUpcoming: groupUpcoming,
    isOverdue: isOverdue,

    // time
    dateKey: dateKey,
    timeStamp: timeStamp,
    parseStamp: parseStamp,
    isAllDayStamp: isAllDayStamp,
    keyOf: keyOf,
    startOfDay: startOfDay,
    addDays: addDays,
    dayDelta: dayDelta,
    relativeTime: relativeTime,
    clockLabel: clockLabel,

    // ids
    uuid: uuid
  };

  global.CalendarStore = Store;

  /* Node (tests) as well as the browser. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CalendarModel: global.CalendarModel, CalendarStore: Store };
  }
})(typeof window !== 'undefined' ? window : globalThis);
