/**
 * ReKonoce · lógica de negocio pura.
 *
 * No usa ningún servicio de Google: recibe un "store" (dónde se guardan los datos)
 * y un "auth" (tokens de administrador). Así la misma lógica corre en Apps Script
 * (Code.gs, con Google Sheets) y en las pruebas locales (qa/, con memoria).
 *
 * Un mes = una votación: el admin la abre, cada persona vota una vez (una persona
 * por pilar, con motivo) y al cerrar gana quien tiene más votos en cada pilar.
 * Empate en el primer lugar = pin compartido.
 *
 * Anonimato: la participación (quién votó) y las papeletas (por quién se votó)
 * se guardan en tablas separadas. Las papeletas no llevan nombre ni hora.
 */
var RK = (function () {
  var PILLARS = ['colaboracion', 'responsabilidad', 'respeto', 'comunicacion'];
  var PILLAR_NAMES = {
    colaboracion: 'Colaboración', responsabilidad: 'Responsabilidad',
    respeto: 'Respeto', comunicacion: 'Comunicación'
  };
  var STAGES = ['idle', 'votacion', 'cerrado', 'revelado'];
  var MIN_REASON = 40;
  var MAX_REASON = 600;
  var MAX_PIN_FAILS = 5;

  function fail(msg) {
    var e = new Error(msg);
    e.userFacing = true;
    throw e;
  }

  function peopleIndex(people) {
    var m = {};
    people.forEach(function (p) { m[p.id] = p; });
    return m;
  }

  function activePeople(people) {
    return people.filter(function (p) { return p.active; });
  }

  /** Votos por persona en un pilar, de mayor a menor (desempate alfabético estable). */
  function tally(ballots, pillar, idx) {
    var m = {};
    ballots.forEach(function (b) {
      if (b.pillar === pillar && b.nominee) m[b.nominee] = (m[b.nominee] || 0) + 1;
    });
    return Object.keys(m).map(function (id) { return { id: id, votes: m[id] }; })
      .sort(function (a, b) {
        if (b.votes !== a.votes) return b.votes - a.votes;
        var na = idx[a.id] ? idx[a.id].name : a.id;
        var nb = idx[b.id] ? idx[b.id].name : b.id;
        return na.localeCompare(nb);
      });
  }

  /** Ganador por pilar: quien tiene más votos. Si hay empate en el primer lugar, el pin es compartido. */
  function computeWinners(ballots, people) {
    var idx = peopleIndex(people);
    var out = {};
    PILLARS.forEach(function (pid) {
      var t = tally(ballots, pid, idx).filter(function (x) { return idx[x.id] && idx[x.id].active; });
      var top = t.length ? t.filter(function (x) { return x.votes === t[0].votes; }) : [];
      out[pid] = { winners: top.map(function (x) { return x.id; }), votes: top.length ? top[0].votes : 0 };
    });
    return out;
  }

  function reasonsFor(ballots, pillar, id) {
    return ballots.filter(function (b) { return b.pillar === pillar && b.nominee === id && b.reason; })
      .map(function (b) { return b.reason; });
  }

  function participationMap(rows) {
    var m = {};
    rows.forEach(function (r) { if (r.stage === 'vot') m[r.person] = r.ts; });
    return m;
  }

  function requireStage(cfg, stage) {
    if (cfg.stage !== stage) fail('Esta acción no está disponible en la etapa actual. Actualiza la pantalla.');
  }

  function validDeadline(ts, now) {
    ts = Number(ts);
    if (!ts || isNaN(ts) || ts <= now) fail('Elige una fecha y hora futura.');
    if (ts > now + 120 * 864e5) fail('La fecha límite no puede estar a más de 120 días.');
    return ts;
  }

  /* ---------- Estado público (lo que ve cualquier persona) ---------- */
  function publicState(store, personId, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var active = activePeople(people);
    var voted = participationMap(cfg.cycleId ? store.getParticipation(cfg.cycleId) : []);
    var st = cfg.stage || 'idle';
    var state = {
      serverNow: now,
      people: people.map(function (p) { return { id: p.id, name: p.name, area: p.area, note: p.note, active: p.active }; }),
      cycle: { month: cfg.month || '', stage: st, deadline: cfg.deadline || null },
      activeCount: active.length,
      // Quién ya votó (nunca por quién): se muestra con un ✓ junto a su nombre
      votedIds: st === 'votacion' ? active.filter(function (p) { return voted[p.id]; }).map(function (p) { return p.id; }) : [],
      votedCount: active.filter(function (p) { return voted[p.id]; }).length,
      me: null,
      winners: null,
      recognitions: null,
      history: store.getHistory()
    };
    if (personId && idx[personId]) state.me = { id: personId, voted: !!voted[personId] };
    if (st === 'revelado' && cfg.winners) {
      var ballots = store.getBallots('nom', cfg.cycleId);
      state.winners = {};
      PILLARS.forEach(function (pid) {
        var w = cfg.winners[pid] || { winners: [], votes: 0 };
        var reasons = [];
        w.winners.forEach(function (id) { reasons = reasons.concat(reasonsFor(ballots, pid, id)); });
        state.winners[pid] = { ids: w.winners, votes: w.votes, reasons: reasons };
      });
      // Todas las personas que recibieron votos, con lo que les escribieron (nunca quién)
      state.recognitions = {};
      PILLARS.forEach(function (pid) {
        state.recognitions[pid] = tally(ballots, pid, idx)
          .filter(function (x) { return idx[x.id] && idx[x.id].active; })
          .map(function (x) { return { id: x.id, reasons: reasonsFor(ballots, pid, x.id) }; });
      });
    }
    return state;
  }

  /* ---------- Votar ---------- */
  function submitVote(store, personId, noms, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var me = idx[personId];
    if (!me || !me.active) fail('No encontramos tu nombre en el equipo activo.');
    requireStage(cfg, 'votacion');
    if (now > cfg.deadline) fail('El plazo de la votación ya terminó.');
    if (participationMap(store.getParticipation(cfg.cycleId))[personId]) fail('Ya enviaste tu voto este mes.');
    if (!noms || typeof noms !== 'object') fail('Faltan tus votos.');
    var rows = [];
    PILLARS.forEach(function (pid) {
      var n = noms[pid];
      if (!n) fail('Falta tu voto en ' + PILLAR_NAMES[pid] + '.');
      if (n.skip) { rows.push({ pillar: pid, nominee: '', reason: '' }); return; }
      var target = idx[n.nominee];
      if (!target || !target.active) fail('La persona elegida en ' + PILLAR_NAMES[pid] + ' no está disponible.');
      if (n.nominee === personId) fail('No puedes votar por ti.');
      var reason = String(n.reason || '').replace(/\s+/g, ' ').trim();
      if (reason.length < MIN_REASON) fail('El motivo en ' + PILLAR_NAMES[pid] + ' necesita al menos ' + MIN_REASON + ' caracteres.');
      if (reason.length > MAX_REASON) fail('El motivo en ' + PILLAR_NAMES[pid] + ' supera los ' + MAX_REASON + ' caracteres.');
      rows.push({ pillar: pid, nominee: n.nominee, reason: reason });
    });
    store.addBallots('nom', cfg.cycleId, rows);
    store.addParticipation(cfg.cycleId, 'vot', personId, now);
    return publicState(store, personId, now);
  }

  /* ---------- Administrador ---------- */
  function adminState(store, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var st = cfg.stage || 'idle';
    var voted = participationMap(cfg.cycleId ? store.getParticipation(cfg.cycleId) : []);
    var out = {
      serverNow: now,
      cycle: { month: cfg.month || '', stage: st, deadline: cfg.deadline || null },
      participation: activePeople(people).map(function (p) { return { id: p.id, ts: voted[p.id] || null }; }),
      tally: null, leaders: null, winners: null
    };
    if (st !== 'idle' && cfg.cycleId) {
      var ballots = store.getBallots('nom', cfg.cycleId);
      out.tally = {};
      PILLARS.forEach(function (pid) {
        out.tally[pid] = {
          rows: tally(ballots, pid, idx),
          skips: ballots.filter(function (b) { return b.pillar === pid && !b.nominee; }).length
        };
      });
      var lead = computeWinners(ballots, people);
      out.leaders = {};
      PILLARS.forEach(function (pid) { out.leaders[pid] = lead[pid].winners; });
      if (cfg.winners) {
        out.winners = {};
        PILLARS.forEach(function (pid) { out.winners[pid] = cfg.winners[pid].winners; });
      }
    }
    return out;
  }

  function adminOpen(store, month, deadline, now) {
    var cfg = store.getConfig();
    requireStage(cfg, 'idle');
    month = String(month || '').trim();
    if (!month || month.length > 40) fail('Elige el mes que se evalúa.');
    var ts = validDeadline(deadline, now);
    store.setConfig({
      cycleId: 'c' + now + '-' + Math.random().toString(36).slice(2, 8), month: month,
      stage: 'votacion', deadline: ts, winners: null
    });
  }

  function adminClose(store) {
    var cfg = store.getConfig();
    requireStage(cfg, 'votacion');
    store.setConfig({ stage: 'cerrado', winners: computeWinners(store.getBallots('nom', cfg.cycleId), store.getPeople()) });
  }

  function adminReveal(store) {
    requireStage(store.getConfig(), 'cerrado');
    store.setConfig({ stage: 'revelado' });
  }

  function adminExtend(store, deadline, now) {
    var cfg = store.getConfig();
    requireStage(cfg, 'votacion');
    store.setConfig({ deadline: validDeadline(deadline, now) });
  }

  function adminArchive(store) {
    var cfg = store.getConfig();
    requireStage(cfg, 'revelado');
    var w = {};
    PILLARS.forEach(function (pid) { w[pid] = (cfg.winners[pid] || { winners: [] }).winners; });
    store.addHistory({ month: cfg.month, winners: w });
    store.setConfig({ cycleId: '', month: '', stage: 'idle', deadline: null, winners: null });
  }

  /* ---------- Punto de entrada único ---------- */
  function handle(store, auth, name, args, now) {
    args = args || [];
    try {
      var data;
      var admin = function () {
        if (!auth.check(args[0])) fail('Tu sesión de administrador expiró. Ingresa el PIN de nuevo.');
      };
      switch (name) {
        case 'state': data = publicState(store, args[0], now); break;
        case 'vote': data = submitVote(store, args[0], args[1], now); break;
        case 'adminLogin':
          if (auth.fails() >= MAX_PIN_FAILS) fail('Demasiados intentos. Espera 10 minutos.');
          if (String(args[0]) !== String(store.getAdminPin())) { auth.addFail(); fail('PIN incorrecto. Intenta de nuevo.'); }
          auth.resetFails();
          data = { token: auth.issue() };
          break;
        case 'admin': admin(); data = adminState(store, now); break;
        case 'adminOpen': admin(); adminOpen(store, args[1], args[2], now); data = adminState(store, now); break;
        case 'adminClose': admin(); adminClose(store); data = adminState(store, now); break;
        case 'adminReveal': admin(); adminReveal(store); data = adminState(store, now); break;
        case 'adminExtend': admin(); adminExtend(store, args[1], now); data = adminState(store, now); break;
        case 'adminArchive': admin(); adminArchive(store); data = adminState(store, now); break;
        default: fail('Acción desconocida.');
      }
      return JSON.stringify({ ok: true, data: data });
    } catch (e) {
      return JSON.stringify({ ok: false, error: e.userFacing ? e.message : 'Algo falló en el servidor. Intenta de nuevo en un momento.', detail: e.userFacing ? undefined : String(e && e.stack || e) });
    }
  }

  return {
    PILLARS: PILLARS, STAGES: STAGES, MIN_REASON: MIN_REASON,
    tally: tally, computeWinners: computeWinners,
    publicState: publicState, adminState: adminState, handle: handle
  };
})();


/**
 * ReKonoce · servidor Apps Script.
 *
 * - doGet() sirve la app (Index.html).
 * - rkApi(name, args) es el único endpoint que usa el cliente (google.script.run.rkApi).
 * - Los datos viven en una Hoja de cálculo de Google con 5 pestañas (ver setup()).
 *
 * Primera vez: ejecuta setup() desde el editor. Crea las pestañas, carga al equipo
 * y guarda el PIN de administrador (5591) en Propiedades del script.
 */

var SHEETS = {
  config: ['clave', 'valor'],
  personas: ['id', 'nombre', 'area', 'nota', 'activo'],
  participacion: ['ciclo', 'etapa', 'persona', 'fecha'],
  nominaciones: ['ciclo', 'pilar', 'persona', 'motivo'],
  historial: ['mes', 'ganadores']
};
var SHEET_TITLES = {
  config: 'Config', personas: 'Personas', participacion: 'Participacion',
  nominaciones: 'Nominaciones', historial: 'Historial'
};

var TEAM = [
  ['mv', 'Mariela Villanueva', 'delivery', '', true],
  ['rm', 'Rodolfo Montoya', 'delivery', '', true],
  ['bb', 'Bruno Bergamín', 'delivery', '', true],
  ['mb', 'Mariela de la Barra', 'delivery', '', true],
  ['vc', 'Vanessa Carrillo', 'delivery', '', true],
  ['na', 'Nathaly Amigo', 'delivery', '', true],
  ['mo', 'Manuel Orellana', 'delivery', '', true],
  ['jp', 'Jorge Pinto', 'delivery', 'Service Manager', true],
  ['mc', 'Margarita Cerda', 'talent', 'Talent Acquisition Lead', true],
  ['mr', 'Marcia Rodríguez', 'talent', '', true],
  ['et', 'Estefanía Toledo', 'talent', '', true],
  ['pr', 'Paula Rojas', 'talent', '', true],
  ['bp', 'Bernardita Pinochet', 'talent', '', true],
  ['gc', 'Gloria Caro', 'talent', '', true],
  ['fv', 'Francisca Venegas', 'talent', '', true],
  ['nm', 'Nicole Marambio', 'talent', '', true],
  ['nb', 'Noelia Barrera', 'talent', 'Postnatal', false],
  ['rj', 'Rossana Jiménez', 'support', '', true],
  ['dm', 'Daniela Moreno', 'support', '', true],
  ['sc', 'Sofía Calderón', 'support', 'Postnatal', false]
];

/* ---------- Web app ---------- */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('ReKonoce · Kiber Champions')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/favicon.ico');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Endpoint único. Devuelve un string JSON: {ok, data} o {ok:false, error}. */
function rkApi(name, args) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'Hay mucha gente votando al mismo tiempo. Intenta de nuevo en unos segundos.' });
  }
  try {
    var res = RK.handle(sheetStore_(), cacheAuth_(), name, args, Date.now());
    var parsed = JSON.parse(res);
    if (!parsed.ok && parsed.detail) console.error(parsed.detail);
    delete parsed.detail;
    return JSON.stringify(parsed);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Configuración inicial ---------- */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = getSpreadsheet_(true);
  Object.keys(SHEETS).forEach(function (k) {
    var sh = ss.getSheetByName(SHEET_TITLES[k]) || ss.insertSheet(SHEET_TITLES[k]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEETS[k]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, SHEETS[k].length).setFontWeight('bold');
    }
  });
  var people = ss.getSheetByName(SHEET_TITLES.personas);
  if (people.getLastRow() === 1) {
    people.getRange(2, 1, TEAM.length, 5).setValues(TEAM);
  }
  var config = ss.getSheetByName(SHEET_TITLES.config);
  if (config.getLastRow() === 1) config.appendRow(['stage', JSON.stringify('idle')]);
  var blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', '5591');
  Logger.log('Listo. Hoja de datos: ' + ss.getUrl());
}

function getSpreadsheet_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    if (!create) throw new Error('Falta ejecutar setup().');
    ss = SpreadsheetApp.create('ReKonoce · datos');
  }
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

/* ---------- Almacenamiento en Google Sheets ---------- */
function sheetStore_() {
  var ss = getSpreadsheet_(false);
  var sh = function (k) {
    var s = ss.getSheetByName(SHEET_TITLES[k]);
    if (!s) throw new Error('Falta la pestaña ' + SHEET_TITLES[k] + '. Ejecuta setup().');
    return s;
  };
  var rows = function (k) {
    var s = sh(k);
    var n = s.getLastRow();
    return n < 2 ? [] : s.getRange(2, 1, n - 1, SHEETS[k].length).getValues();
  };
  var cfgCache = null;

  return {
    getAdminPin: function () {
      return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '5591';
    },
    getConfig: function () {
      if (cfgCache) return cfgCache;
      var c = {};
      rows('config').forEach(function (r) {
        try { c[r[0]] = JSON.parse(r[1]); } catch (e) { c[r[0]] = r[1]; }
      });
      if (!c.stage) c.stage = 'idle';
      cfgCache = c;
      return c;
    },
    setConfig: function (patch) {
      var s = sh('config');
      var data = rows('config');
      Object.keys(patch).forEach(function (k) {
        var val = JSON.stringify(patch[k] === undefined ? null : patch[k]);
        var i = -1;
        for (var j = 0; j < data.length; j++) if (data[j][0] === k) { i = j; break; }
        if (i >= 0) s.getRange(i + 2, 2).setValue(val);
        else { s.appendRow([k, val]); data.push([k, val]); }
      });
      cfgCache = null;
    },
    getPeople: function () {
      return rows('personas').filter(function (r) { return r[0]; }).map(function (r) {
        return {
          id: String(r[0]).trim(), name: String(r[1]).trim(), area: String(r[2]).trim(),
          note: String(r[3] || '').trim(), active: r[4] === true || String(r[4]).toUpperCase() === 'TRUE'
        };
      });
    },
    getParticipation: function (cycle) {
      return rows('participacion').filter(function (r) { return r[0] === cycle; })
        .map(function (r) { return { stage: r[1], person: r[2], ts: Number(r[3]) }; });
    },
    addParticipation: function (cycle, stage, person, ts) {
      sh('participacion').appendRow([cycle, stage, person, ts]);
    },
    getBallots: function (kind, cycle) {
      return rows('nominaciones').filter(function (r) { return r[0] === cycle; }).map(function (r) {
        return { pillar: r[1], nominee: String(r[2] || ''), reason: String(r[3] || '') };
      });
    },
    /** Inserta cada papeleta en una fila al azar para que el orden no delate quién votó. */
    addBallots: function (kind, cycle, list) {
      var s = sh('nominaciones');
      list.forEach(function (b) {
        var row = [cycle, b.pillar, b.nominee, b.reason];
        var last = s.getLastRow();
        var after = 1 + Math.floor(Math.random() * last);
        if (after > last) after = last;
        s.insertRowAfter(after);
        s.getRange(after + 1, 1, 1, row.length).setValues([row]);
      });
    },
    getHistory: function () {
      return rows('historial').map(function (r) {
        var w = {};
        try { w = JSON.parse(r[1]); } catch (e) { }
        return { month: r[0], winners: w };
      }).reverse();
    },
    addHistory: function (entry) {
      sh('historial').appendRow([entry.month, JSON.stringify(entry.winners)]);
    }
  };
}

/* ---------- Sesión de administrador (tokens en caché, 6 horas) ---------- */
function cacheAuth_() {
  var cache = CacheService.getScriptCache();
  return {
    issue: function () {
      var t = Utilities.getUuid();
      cache.put('adm_' + t, '1', 21600);
      return t;
    },
    check: function (t) { return !!t && cache.get('adm_' + t) === '1'; },
    fails: function () { return Number(cache.get('pinfails') || 0); },
    addFail: function () { cache.put('pinfails', String(this.fails() + 1), 600); },
    resetFails: function () { cache.remove('pinfails'); }
  };
}
