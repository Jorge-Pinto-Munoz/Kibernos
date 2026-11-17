/* Carga Logic.gs y la lista del equipo de Code.gs dentro de Node, sin servicios de Google. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'apps-script');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'Logic.gs'), 'utf8') + '\nthis.RK = RK;', ctx);
const code = fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8');
const TEAM = vm.runInNewContext(code.match(/var TEAM = (\[[\s\S]*?\n\]);/)[1]);
module.exports = { RK: ctx.RK, TEAM, ...require('./memstore.js') };
