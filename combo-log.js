/* ============================================================
 * combo-log.js — one drink, three stores, one delete.
 *
 * Logging a Monster from the quick box writes to three different keys:
 * 500 ml into water, 230 kcal into macros, 160 mg into stimulants. Each
 * page only knows about its own key, so deleting the caffeine entry on the
 * Enhancers page used to leave the water and calories behind forever.
 *
 * So every composite log gets a group id, stamped onto each part it wrote,
 * and recorded here. Deleting any part looks the group up and reverses the
 * rest. Include this file on any page that can delete one of those parts.
 *
 *   const grp = ComboLog.newId();
 *   ComboLog.register(grp, { name, dateKey, ml, cal, mg });
 *   ComboLog.remove(grp);       // undoes water + food + caffeine
 *
 * Deliberately tolerant: a part that has already gone (deleted by hand, or
 * never written because the drink had no calories) is skipped rather than
 * treated as an error.
 * ============================================================ */
(function () {
  if (window.ComboLog) return;

  var KEY = 'patron_combo_v1';
  var WATER_KEY = 'water_standalone_v1';
  var FOOD_KEY = 'macros_standalone_v1';
  var STIM_KEY = 'stimulant_standalone_v1';

  function read(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function write(k, v) {
    var s = JSON.stringify(v);
    try {
      if (window.PatronDB && PatronDB.write) PatronDB.write(k, s);
      else localStorage.setItem(k, s);
    } catch (e) {}
  }
  function dateKeyOf(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function loadGroups() { var g = read(KEY); return (g && typeof g === 'object') ? g : {}; }

  function newId() { return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function register(grp, info) {
    if (!grp) return;
    var g = loadGroups();
    g[grp] = {
      name: info.name || '', dateKey: info.dateKey || dateKeyOf(),
      ml: Number(info.ml) || 0, cal: Number(info.cal) || 0, mg: Number(info.mg) || 0,
      ts: Date.now()
    };
    // Keep this from growing without bound — it is only needed to undo.
    var keys = Object.keys(g);
    if (keys.length > 400) {
      keys.sort(function (a, b) { return (g[a].ts || 0) - (g[b].ts || 0); });
      while (keys.length > 400) delete g[keys.shift()];
    }
    write(KEY, g);
  }

  /* ---- reversing each part ---- */
  function undoWater(grp, rec) {
    if (!rec.ml) return;
    var s = read(WATER_KEY); if (!s || !s.logs) return;
    var k = rec.dateKey;
    var left = (Number(s.logs[k]) || 0) - rec.ml;
    if (left > 0) s.logs[k] = left; else delete s.logs[k];
    // Drop one matching pour so undo stays in step with the total.
    if (s.adds && Array.isArray(s.adds[k])) {
      var i = s.adds[k].indexOf(rec.ml);
      if (i > -1) s.adds[k].splice(i, 1);
      if (!s.adds[k].length) delete s.adds[k];
    }
    write(WATER_KEY, s);
  }
  function undoFood(grp) {
    var s = read(FOOD_KEY); if (!s) return;
    var changed = false;
    Object.keys(s).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(s[k])) return;
      var next = s[k].filter(function (e) { return !e || e.grp !== grp; });
      if (next.length !== s[k].length) { s[k] = next; changed = true; }
    });
    if (changed) write(FOOD_KEY, s);
  }
  function undoStim(grp) {
    var s = read(STIM_KEY); if (!s || !Array.isArray(s.logs)) return;
    var next = s.logs.filter(function (l) { return !l || l.grp !== grp; });
    if (next.length !== s.logs.length) { s.logs = next; write(STIM_KEY, s); }
  }

  /* Remove every part of a composite log. Safe to call with an unknown id. */
  function remove(grp) {
    if (!grp) return false;
    var g = loadGroups();
    var rec = g[grp];
    if (!rec) { undoFood(grp); undoStim(grp); return false; }
    undoWater(grp, rec);
    undoFood(grp);
    undoStim(grp);
    delete g[grp];
    write(KEY, g);
    return true;
  }

  function get(grp) { return loadGroups()[grp] || null; }

  /* ---- the drink catalogue ----
   * Lives here rather than in food.html because deleting on the Enhancers
   * page needs it too: an entry logged before group ids existed carries no
   * link, so the only way to know a Monster was also 500 ml and 230 kcal is
   * to look the name up. Per standard serving, rounded from label values. */
  var DRINKS = [
    { name: 'Monster Energy',        ml: 500, cal: 230, c: 54, p: 0,  f: 0, mg: 160 },
    { name: 'Monster Ultra (zero)',  ml: 500, cal: 10,  c: 4,  p: 0,  f: 0, mg: 150 },
    { name: 'Red Bull',              ml: 250, cal: 112, c: 27, p: 0,  f: 0, mg: 80 },
    { name: 'Red Bull sugarfree',    ml: 250, cal: 8,   c: 1,  p: 0,  f: 0, mg: 80 },
    { name: 'Nocco',                 ml: 330, cal: 15,  c: 1,  p: 0,  f: 0, mg: 180 },
    { name: 'Celsius',               ml: 355, cal: 10,  c: 2,  p: 0,  f: 0, mg: 200 },
    { name: 'Bang',                  ml: 473, cal: 0,   c: 0,  p: 0,  f: 0, mg: 300 },
    { name: 'Prime Energy',          ml: 355, cal: 20,  c: 5,  p: 0,  f: 0, mg: 200 },
    { name: 'Coca-Cola',             ml: 330, cal: 139, c: 35, p: 0,  f: 0, mg: 32 },
    { name: 'Coca-Cola Zero',        ml: 330, cal: 1,   c: 0,  p: 0,  f: 0, mg: 32 },
    { name: 'Espresso',              ml: 30,  cal: 3,   c: 0,  p: 0,  f: 0, mg: 63 },
    { name: 'Double espresso',       ml: 60,  cal: 6,   c: 0,  p: 0,  f: 0, mg: 126 },
    { name: 'Filter coffee',         ml: 240, cal: 2,   c: 0,  p: 0,  f: 0, mg: 95 },
    { name: 'Cold brew',             ml: 470, cal: 5,   c: 0,  p: 0,  f: 0, mg: 205 },
    { name: 'Latte',                 ml: 350, cal: 190, c: 18, p: 10, f: 7, mg: 126 },
    { name: 'Cappuccino',            ml: 250, cal: 120, c: 12, p: 8,  f: 5, mg: 126 },
    { name: 'Green tea',             ml: 240, cal: 2,   c: 0,  p: 0,  f: 0, mg: 28 },
    { name: 'Black tea',             ml: 240, cal: 2,   c: 0,  p: 0,  f: 0, mg: 47 },
    { name: 'Pre-workout (1 scoop)', ml: 300, cal: 10,  c: 2,  p: 0,  f: 0, mg: 200 },
    { name: 'Protein shake (whey)',  ml: 400, cal: 120, c: 3,  p: 24, f: 2, mg: 0 }
  ];
  function findDrink(name) {
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < DRINKS.length; i++) if (DRINKS[i].name.toLowerCase() === n) return DRINKS[i];
    return null;
  }

  /* Fallback for entries with no group id: undo ONE water pour and ONE food
   * row for a catalogue drink of this name on this day. Used when deleting a
   * caffeine log that predates group ids. Never touches the caffeine list —
   * the caller is already removing the entry it clicked. */
  function removeSiblingsByName(name, dateKey) {
    var d = findDrink(name); if (!d) return false;
    var k = dateKey || dateKeyOf();
    var did = false;

    if (d.ml > 0) {
      var w = read(WATER_KEY);
      if (w && w.logs && (Number(w.logs[k]) || 0) >= d.ml) {
        var left = (Number(w.logs[k]) || 0) - d.ml;
        if (left > 0) w.logs[k] = left; else delete w.logs[k];
        if (w.adds && Array.isArray(w.adds[k])) {
          var i = w.adds[k].indexOf(d.ml);
          if (i > -1) w.adds[k].splice(i, 1);
          if (!w.adds[k].length) delete w.adds[k];
        }
        write(WATER_KEY, w); did = true;
      }
    }

    var m = read(FOOD_KEY);
    if (m && Array.isArray(m[k])) {
      for (var j = m[k].length - 1; j >= 0; j--) {
        var e = m[k][j];
        if (e && String(e.name).toLowerCase() === d.name.toLowerCase()) { m[k].splice(j, 1); write(FOOD_KEY, m); did = true; break; }
      }
    }
    return did;
  }

  /* Remove a composite log by group id, falling back to the name. */
  function removeFor(grp, name, dateKey) {
    if (grp && remove(grp)) return true;
    return removeSiblingsByName(name, dateKey);
  }

  window.ComboLog = {
    newId: newId, register: register, remove: remove, get: get, dateKeyOf: dateKeyOf,
    drinks: DRINKS, findDrink: findDrink, removeSiblingsByName: removeSiblingsByName, removeFor: removeFor
  };
})();
