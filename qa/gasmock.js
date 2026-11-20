/* Simulación de Google Sheets y servicios de Apps Script para ejecutar dist/Code.gs en Node. */
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeSheet(name) {
  const grid = []; // filas de valores
  const sh = {
    name, grid,
    getLastRow: () => { let n = grid.length; while (n > 0 && !(grid[n - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) n--; return n; },
    appendRow: row => { grid[sh.getLastRow()] = row.slice(); return sh; },
    insertRowAfter: r => { grid.splice(r, 0, []); return sh; },
    setFrozenRows: () => sh,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (grid[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      setValues(vals) { vals.forEach((row, i) => { const R = grid[r - 1 + i] || (grid[r - 1 + i] = []); row.forEach((v, j) => { R[c - 1 + j] = v; }); }); return this; },
      setValue(v) { const R = grid[r - 1] || (grid[r - 1] = []); R[c - 1] = v; return this; },
      setFontWeight() { return this; },
      clearContent() { for (let i = 0; i < nr; i++) { const R = grid[r - 1 + i]; if (R) for (let j = 0; j < nc; j++) R[c - 1 + j] = ''; } return this; }
    })
  };
  return sh;
}
function makeEnv() {
  const sheets = {};
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: s => { delete sheets[s.name]; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/x', getId: () => 'x'
  };
  const props = {}, cache = {}, logs = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, create: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => 'tok-' + Math.random().toString(36).slice(2) },
    Logger: { log: m => logs.push(m) }, console: { error: m => logs.push(m) },
    HtmlService: {}, JSON, Date, Math, Object, Array, String, Number, Error,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: c => ({ content: c, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  const call = (name, ...args) => JSON.parse(ctx.rkApi(name, args));
  return { ctx, sheets, cache, props, logs, call };
}
module.exports = { makeEnv };
