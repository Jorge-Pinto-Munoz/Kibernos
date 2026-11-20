/**
 * ReKonoce · servidor Apps Script.
 *
 * - La app (index.html) se publica en Netlify y llama a doPost() por HTTPS.
 * - doPost() y rkApi(name, args) son la única entrada: votar, leer el estado y el panel de administrador.
 * - Los datos viven en una Hoja de cálculo de Google con 5 pestañas (ver setup()).
 *
 * Primera vez: ejecuta setup() desde el editor. Crea las pestañas, carga al equipo
 * y guarda el PIN de administrador (5591) en Propiedades del script.
 */

var SHEETS = {
  config: ['clave', 'valor'],
  personas: ['id', 'nombre', 'area', 'nota', 'activo', 'lider'],
  // Las primeras columnas las usa la app; las de la derecha son para leer la Hoja (nombres completos)
  participacion: ['ciclo', 'etapa', 'id', 'fecha_ms', 'votó (nombre)', 'fecha'],
  nominaciones: ['ciclo', 'pilar', 'id', 'motivo', 'reconocido (nombre)', 'pilar (nombre)', 'voto de líder'],
  historial: ['mes', 'ganadores_ids', 'ganadores']
};
var SHEET_TITLES = {
  config: 'Config', personas: 'Personas', participacion: 'Participacion',
  nominaciones: 'Nominaciones', historial: 'Historial'
};

var TEAM = [
  ['mv', 'Mariela Villanueva', 'delivery', '', true, false],
  ['rm', 'Rodolfo Montoya', 'delivery', '', true, false],
  ['bb', 'Bruno Bergamín', 'delivery', '', true, false],
  ['mb', 'Mariela de la Barra', 'delivery', '', true, false],
  ['vc', 'Vanessa Carrillo', 'delivery', '', true, false],
  ['na', 'Nathaly Amigo', 'delivery', '', true, false],
  ['mo', 'Manuel Orellana', 'delivery', '', true, false],
  ['jp', 'Jorge Pinto', 'delivery', 'Service Manager', true, true],
  ['mc', 'Margarita Cerda', 'talent', 'Talent Acquisition Lead', true, true],
  ['mr', 'Marcia Rodríguez', 'talent', '', true, false],
  ['et', 'Estefanía Toledo', 'talent', '', true, false],
  ['pr', 'Paula Rojas', 'talent', '', true, false],
  ['bp', 'Bernardita Pinochet', 'talent', '', true, false],
  ['gc', 'Gloria Caro', 'talent', '', true, false],
  ['fv', 'Francisca Venegas', 'talent', '', true, false],
  ['nm', 'Nicole Marambio', 'talent', '', true, false],
  ['nb', 'Noelia Barrera', 'talent', 'Postnatal', false, false],
  ['rj', 'Rossana Jiménez', 'support', '', true, false],
  ['dm', 'Daniela Moreno', 'support', '', true, false],
  ['sc', 'Sofía Calderón', 'support', 'Postnatal', false, false]
];

/* ---------- Servidor de datos (la app vive en Netlify) ---------- */
/** Abrir el link /exec en el navegador solo confirma que el servidor está activo. */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'ReKonoce', servidor: 'activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * API para la página publicada fuera de Google (por ejemplo Netlify).
 * Recibe {name, args} como texto JSON y responde lo mismo que rkApi.
 * Se usa POST con Content-Type text/plain para evitar la consulta previa de CORS.
 */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    out = rkApi(String(body.name || ''), body.args || []);
  } catch (err) {
    out = JSON.stringify({ ok: false, error: 'Solicitud inválida.' });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}


/** Endpoint único. Devuelve un string JSON: {ok, data} o {ok:false, error}. */
var WRITES_ = ['vote', 'adminOpen', 'adminClose', 'adminReveal', 'adminExtend', 'adminArchive', 'adminReset'];
function rkApi(name, args) {
  args = args || [];
  // Lectura pública rápida: el estado es igual para todos; «me» se calcula aparte
  if (name === 'state') {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('rk_state');
    if (hit) {
      var st = JSON.parse(hit);
      st.serverNow = Date.now();
      st.me = meFor_(st, args[0]);
      return JSON.stringify({ ok: true, data: st });
    }
    var res = JSON.parse(RK.handle(sheetStore_(), cacheAuth_(), 'state', [null], Date.now()));
    if (res.ok) {
      var raw = JSON.stringify(res.data);
      if (raw.length < 95000) cache.put('rk_state', raw, 60);
      res.data.me = meFor_(res.data, args[0]);
    }
    delete res.detail;
    return JSON.stringify(res);
  }
  var write = WRITES_.indexOf(name) >= 0;
  var lock = LockService.getScriptLock();
  if (write) {
    try { lock.waitLock(20000); } catch (e) {
      return JSON.stringify({ ok: false, error: 'Hay mucha gente votando al mismo tiempo. Intenta de nuevo en unos segundos.' });
    }
  }
  try {
    var parsed = JSON.parse(RK.handle(sheetStore_(), cacheAuth_(), name, args, Date.now()));
    if (!parsed.ok && parsed.detail) console.error(parsed.detail);
    delete parsed.detail;
    if (write && parsed.ok) CacheService.getScriptCache().remove('rk_state');
    return JSON.stringify(parsed);
  } finally {
    if (write) lock.releaseLock();
  }
}

function meFor_(st, personId) {
  if (!personId) return null;
  for (var i = 0; i < st.people.length; i++) {
    if (st.people[i].id === personId) return { id: personId, voted: (st.votedIds || []).indexOf(personId) >= 0 };
  }
  return null;
}

/* ---------- Configuración inicial ---------- */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = getSpreadsheet_(true);
  Object.keys(SHEETS).forEach(function (k) {
    var sh = ss.getSheetByName(SHEET_TITLES[k]) || ss.insertSheet(SHEET_TITLES[k]);
    sh.getRange(1, 1, 1, SHEETS[k].length).setValues([SHEETS[k]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var people = ss.getSheetByName(SHEET_TITLES.personas);
  if (people.getLastRow() === 1) {
    people.getRange(2, 1, TEAM.length, 6).setValues(TEAM);
  }
  var config = ss.getSheetByName(SHEET_TITLES.config);
  if (config.getLastRow() === 1) config.appendRow(['stage', JSON.stringify('idle')]);
  fillNames_(ss);
  var blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', '5591');
  Logger.log('Listo. Hoja de datos: ' + ss.getUrl());
}

var MONTHS_ = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** Google Sheets convierte «Noviembre 2026» en fecha: se vuelve a texto al leer. */
function monthText_(v) {
  if (v instanceof Date && !isNaN(v)) return MONTHS_[v.getMonth()] + ' ' + v.getFullYear();
  var s = String(v || '').replace(/^'/, '').trim();
  var iso = s.match(/^(\d{4})-(\d{2})-\d{2}T/);
  if (iso) { var d = new Date(s); return MONTHS_[d.getMonth()] + ' ' + d.getFullYear(); }
  return s;
}

/** Líderes por defecto: sus votos desempatan. Se puede cambiar en la pestaña Personas (columna lider). */
var LEADERS_ = ['jp', 'mc'];

var PILLAR_LABELS_ = { colaboracion: 'Colaboración', responsabilidad: 'Responsabilidad', respeto: 'Respeto', comunicacion: 'Comunicación' };

function namesById_(ss) {
  var m = {};
  var sh = ss.getSheetByName(SHEET_TITLES.personas);
  var n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (r[0]) m[String(r[0]).trim()] = String(r[1]).trim(); });
  return m;
}

function winnersText_(winners, names) {
  return Object.keys(PILLAR_LABELS_).map(function (pid) {
    var ids = winners[pid] || [];
    return PILLAR_LABELS_[pid] + ': ' + (ids.length ? ids.map(function (id) { return names[id] || id; }).join(' y ') : 'sin ganador');
  }).join(' · ');
}

/** Completa los nombres completos en filas guardadas antes de que existieran esas columnas. */
function fillNames_(ss) {
  var names = namesById_(ss);
  var fix = function (key, build) {
    var sh = ss.getSheetByName(SHEET_TITLES[key]);
    var n = sh.getLastRow();
    if (n < 2) return;
    var w = SHEETS[key].length;
    var data = sh.getRange(2, 1, n - 1, w).getValues();
    var changed = false;
    data.forEach(function (r) { if (r[0] && build(r)) changed = true; });
    if (changed) sh.getRange(2, 1, n - 1, w).setValues(data);
  };
  fix('personas', function (r) {
    if (r[5] === true || r[5] === false || String(r[5]).trim() !== '') return false;
    r[5] = LEADERS_.indexOf(String(r[0]).trim()) >= 0;
    return true;
  });
  fix('participacion', function (r) {
    if (r[4] && r[5]) return false;
    r[4] = names[r[2]] || r[2];
    r[5] = r[3] ? new Date(Number(r[3])) : '';
    return true;
  });
  fix('nominaciones', function (r) {
    if (r[4] || !r[2]) { if (!r[5] && r[1]) { r[5] = PILLAR_LABELS_[r[1]] || r[1]; return true; } return false; }
    r[4] = names[r[2]] || r[2];
    r[5] = PILLAR_LABELS_[r[1]] || r[1];
    return true;
  });
  fix('historial', function (r) {
    if (r[0] instanceof Date) { r[0] = "'" + monthText_(r[0]); if (r[2]) return true; }
    if (r[2]) return false;
    var w = {};
    try { w = JSON.parse(r[1]); } catch (e) { return false; }
    r[2] = winnersText_(w, names);
    return true;
  });
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
  var namesCache = null;
  var names = function () { return namesCache || (namesCache = namesById_(ss)); };

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
          note: String(r[3] || '').trim(), active: r[4] === true || String(r[4]).toUpperCase() === 'TRUE',
          leader: r[5] === true || String(r[5]).toUpperCase() === 'TRUE'
        };
      });
    },
    getParticipation: function (cycle) {
      return rows('participacion').filter(function (r) { return r[0] === cycle; })
        .map(function (r) { return { stage: r[1], person: r[2], ts: Number(r[3]) }; });
    },
    addParticipation: function (cycle, stage, person, ts) {
      sh('participacion').appendRow([cycle, stage, person, ts, names()[person] || person, new Date(ts)]);
    },
    getBallots: function (kind, cycle) {
      return rows('nominaciones').filter(function (r) { return r[0] === cycle; }).map(function (r) {
        return { pillar: r[1], nominee: String(r[2] || ''), reason: String(r[3] || ''), leader: r[6] === true || String(r[6]).toUpperCase() === 'TRUE' };
      });
    },
    /** Inserta cada papeleta en una fila al azar para que el orden no delate quién votó. */
    addBallots: function (kind, cycle, list) {
      var s = sh('nominaciones');
      list.forEach(function (b) {
        var row = [cycle, b.pillar, b.nominee, b.reason, b.nominee ? (names()[b.nominee] || b.nominee) : '(sin voto)', PILLAR_LABELS_[b.pillar] || b.pillar, !!b.leader];
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
        return { month: monthText_(r[0]), winners: w };
      }).reverse();
    },
    /** Borra las filas de un ciclo (o de todos, con null) en Participacion y Nominaciones. */
    clearCycle: function (cycle) {
      ['participacion', 'nominaciones'].forEach(function (k) {
        var s = sh(k), n = s.getLastRow();
        if (n < 2) return;
        var w = SHEETS[k].length;
        var keep = s.getRange(2, 1, n - 1, w).getValues().filter(function (r) { return r[0] && cycle !== null && r[0] !== cycle; });
        s.getRange(2, 1, n - 1, w).clearContent();
        if (keep.length) s.getRange(2, 1, keep.length, w).setValues(keep);
      });
    },
    clearHistory: function () {
      var s = sh('historial'), n = s.getLastRow();
      if (n > 1) s.getRange(2, 1, n - 1, SHEETS.historial.length).clearContent();
    },
    addHistory: function (entry) {
      // El apóstrofo obliga a Sheets a guardarlo como texto (no lo muestra)
      sh('historial').appendRow(["'" + entry.month, JSON.stringify(entry.winners), winnersText_(entry.winners, names())]);
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
