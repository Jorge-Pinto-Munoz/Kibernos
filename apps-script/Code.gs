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
  return HtmlService.createTemplateFromFile(indexName_()).evaluate()
    .setTitle('ReKonoce · Kiber Champions')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/favicon.ico');
}

/** Busca el HTML principal aunque se haya nombrado con otra mayúscula o con «.html». */
function indexName_() {
  var names = ['Index', 'index', 'INDEX', 'Index.html', 'index.html', 'Index.html.html', 'Index ', 'Página', 'Pagina'];
  for (var i = 0; i < names.length; i++) {
    try { HtmlService.createHtmlOutputFromFile(names[i]); return names[i]; } catch (e) { }
  }
  throw new Error('Falta el archivo HTML «Index». En el editor: + → HTML, nómbralo Index y pega Index.html. Luego Implementar → Nueva versión.');
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
