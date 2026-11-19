/* Ejecuta el Code.gs real (dist/Code.gs) contra una simulación de Google Sheets y servicios de Apps Script.
   Verifica setup(), lo que queda escrito en cada pestaña (con nombres completos), la caché y el relleno de filas antiguas.
   Uso: node scripts/build-dist.js && node --test qa/gas.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./gasmock.js');

const R = 'Durante todo el mes ayudó a ordenar el trabajo y nos explicó con paciencia cada paso.';
const vote = m => Object.fromEntries(['colaboracion', 'responsabilidad', 'respeto', 'comunicacion'].map(p => [p, m[p] ? { nominee: m[p], reason: R } : { skip: true }]));

test('setup crea las pestañas con encabezados, el equipo y el PIN', () => {
  const e = makeEnv();
  e.ctx.setup();
  assert.deepEqual(Object.keys(e.sheets).sort(), ['Config', 'Historial', 'Nominaciones', 'Participacion', 'Personas']);
  assert.deepEqual(e.sheets.Participacion.grid[0], ['ciclo', 'etapa', 'id', 'fecha_ms', 'votó (nombre)', 'fecha']);
  assert.equal(e.sheets.Personas.grid.length, 21, '20 personas + encabezado');
  assert.equal(e.props.ADMIN_PIN, '5591');
  e.ctx.setup(); // repetir no duplica
  assert.equal(e.sheets.Personas.grid.length, 21);
});

test('flujo completo en Sheets: guarda nombres completos y nunca quién votó por quién', () => {
  const e = makeEnv(); e.ctx.setup();
  const tok = e.call('adminLogin', '5591').data.token;
  assert.ok(e.call('adminOpen', tok, 'Noviembre 2026', Date.now() + 3 * 864e5).ok);
  assert.ok(e.call('vote', 'mo', vote({ colaboracion: 'rm', respeto: 'mc' })).ok);
  assert.ok(e.call('vote', 'bb', vote({ colaboracion: 'rm', responsabilidad: 'vc' })).ok);

  const part = e.sheets.Participacion.grid.slice(1);
  assert.deepEqual(part.map(r => r[4]).sort(), ['Bruno Bergamín', 'Manuel Orellana']);
  assert.ok(part.every(r => r[5] instanceof Date), 'fecha legible');

  const noms = e.sheets.Nominaciones.grid.slice(1);
  assert.equal(noms.length, 8);
  assert.equal(noms.filter(r => r[4] === 'Rodolfo Montoya').length, 2);
  assert.ok(noms.some(r => r[4] === 'Margarita Cerda' && r[5] === 'Respeto'));
  assert.ok(noms.some(r => r[4] === '(sin voto)'));
  const flat = JSON.stringify(noms);
  assert.ok(!flat.includes('Manuel Orellana') && !flat.includes('Bruno Bergamín'), 'las papeletas no nombran a quien votó');

  // caché del estado: se llena al leer y se borra al votar
  const s1 = e.call('state', 'mo');
  assert.equal(s1.data.me.voted, true); assert.ok(e.cache.rk_state);
  assert.equal(e.call('state', 'gc').data.me.voted, false, '«me» se calcula por persona desde la caché');
  assert.ok(e.call('vote', 'gc', vote({ colaboracion: 'et' })).ok);
  assert.equal(e.cache.rk_state, undefined, 'votar limpia la caché');
  assert.equal(e.call('state', null).data.votedCount, 3);

  assert.ok(e.call('adminClose', tok).ok);
  assert.ok(e.call('adminReveal', tok).ok);
  const rev = e.call('state', 'mo').data;
  assert.deepEqual(rev.winners.colaboracion.ids, ['rm']);
  assert.ok(e.call('adminArchive', tok).ok);
  const hist = e.sheets.Historial.grid.slice(1);
  assert.match(hist[0][2], /Colaboración: Rodolfo Montoya · Responsabilidad: Vanessa Carrillo · Respeto: Margarita Cerda · Comunicación: sin ganador/);
});

test('setup completa los nombres de filas guardadas con la versión anterior', () => {
  const e = makeEnv(); e.ctx.setup();
  e.sheets.Participacion.grid.push(['c1', 'vot', 'rm', 1763400000000]);
  e.sheets.Nominaciones.grid.push(['c1', 'respeto', 'mc', R]);
  e.sheets.Historial.grid.push(['Octubre 2026', JSON.stringify({ colaboracion: ['gc'], responsabilidad: [], respeto: ['rj'], comunicacion: ['mv'] })]);
  e.ctx.setup();
  assert.equal(e.sheets.Participacion.grid[1][4], 'Rodolfo Montoya');
  assert.equal(e.sheets.Nominaciones.grid[1][4], 'Margarita Cerda');
  assert.equal(e.sheets.Nominaciones.grid[1][5], 'Respeto');
  assert.match(e.sheets.Historial.grid[1][2], /Colaboración: Gloria Caro · Responsabilidad: sin ganador/);
});
