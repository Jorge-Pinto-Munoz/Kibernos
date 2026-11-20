/* Almacenamiento en memoria con la misma interfaz que sheetStore_() de Code.gs. Lo usan las pruebas y el arnés local. */
(function (root) {
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function makeMemStore(team, pin) {
    var db = {
      config: { stage: 'idle' },
      people: team.map(function (r) { return { id: r[0], name: r[1], area: r[2], note: r[3], active: r[4], leader: !!r[5] }; }),
      part: [], nom: [], fin: [], hist: []
    };
    return {
      db: db,
      getAdminPin: function () { return pin; },
      getConfig: function () { return clone(db.config); },
      setConfig: function (p) { Object.keys(p).forEach(function (k) { db.config[k] = clone(p[k] === undefined ? null : p[k]); }); },
      getPeople: function () { return clone(db.people); },
      getParticipation: function (c) { return db.part.filter(function (r) { return r.cycle === c; }).map(function (r) { return { stage: r.stage, person: r.person, ts: r.ts }; }); },
      addParticipation: function (c, s, p, ts) { db.part.push({ cycle: c, stage: s, person: p, ts: ts }); },
      getBallots: function (k, c) { return db[k].filter(function (b) { return b.cycle === c; }).map(function (b) { return { pillar: b.pillar, nominee: b.nominee, reason: k === 'nom' ? b.reason : '', leader: !!b.leader }; }); },
      addBallots: function (k, c, list) {
        list.forEach(function (b) {
          var row = { cycle: c, pillar: b.pillar, nominee: b.nominee };
          if (k === 'nom') { row.reason = b.reason; row.leader = !!b.leader; }
          db[k].splice(Math.floor(Math.random() * (db[k].length + 1)), 0, row);
        });
      },
      getHistory: function () { return clone(db.hist).reverse(); },
      addHistory: function (e) { db.hist.push(clone(e)); },
      clearCycle: function (c) { ['part', 'nom', 'fin'].forEach(function (k) { db[k] = db[k].filter(function (r) { return c !== null && r.cycle !== c; }); }); },
      clearHistory: function () { db.hist = []; }
    };
  }
  function makeMemAuth() {
    var tokens = {}, fails = 0;
    return {
      issue: function () { var t = 't' + Math.random().toString(36).slice(2); tokens[t] = true; return t; },
      check: function (t) { return !!t && !!tokens[t]; },
      fails: function () { return fails; },
      addFail: function () { fails++; },
      resetFails: function () { fails = 0; }
    };
  }
  root.makeMemStore = makeMemStore;
  root.makeMemAuth = makeMemAuth;
})(typeof module !== 'undefined' ? module.exports : window);
