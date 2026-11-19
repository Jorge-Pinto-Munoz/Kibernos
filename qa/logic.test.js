/* Pruebas de la lógica de ReKonoce. Ejecutar: node --test qa/logic.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { RK, TEAM, makeMemStore, makeMemAuth } = require('./load.js');

const DAY = 864e5;
const PILLARS = RK.PILLARS;
const R = 'Hizo algo concreto este mes que ayudó mucho a todo el equipo.'; // > 40 caracteres
const ACTIVE = TEAM.filter(t => t[4]).map(t => t[0]);

function setup() {
  const store = makeMemStore(TEAM, '5591');
  const auth = makeMemAuth();
  let clock = Date.UTC(2026, 10, 17, 12);
  const call = (name, ...args) => JSON.parse(RK.handle(store, auth, name, args, clock));
  const ok = (name, ...args) => { const r = call(name, ...args); assert.ok(r.ok, name + ': ' + r.error); return r.data; };
  const bad = (name, ...args) => { const r = call(name, ...args); assert.equal(r.ok, false, name + ' debía fallar'); return r.error; };
  const token = ok('adminLogin', '5591').token;
  return { store, auth, call, ok, bad, token, tick: ms => { clock += ms; }, now: () => clock };
}
function votes(map) { // map: {pillar: nomineeId | null}
  const o = {};
  PILLARS.forEach(p => { o[p] = map[p] ? { nominee: map[p], reason: R } : { skip: true }; });
  return o;
}
function open(t) { t.ok('adminOpen', t.token, 'Noviembre 2026', t.now() + 3 * DAY); }

test('PIN: correcto entrega token, incorrecto falla y bloquea tras 5 intentos', () => {
  const t = setup();
  assert.match(t.bad('adminLogin', '0000'), /PIN incorrecto/);
  for (let i = 0; i < 4; i++) t.bad('adminLogin', '1111');
  assert.match(t.bad('adminLogin', '5591'), /Demasiados intentos/);
});

test('acciones de administrador exigen token válido', () => {
  const t = setup();
  assert.match(t.bad('admin', 'token-falso'), /sesión de administrador/);
  assert.match(t.bad('adminOpen', null, 'Noviembre 2026', t.now() + DAY), /sesión de administrador/);
});

test('abrir la votación del mes con fecha límite programada', () => {
  const t = setup();
  assert.match(t.bad('adminOpen', t.token, '', t.now() + DAY), /mes/);
  assert.match(t.bad('adminOpen', t.token, 'Noviembre 2026', t.now() - 1000), /fecha y hora futura/);
  open(t);
  const s = t.ok('state', null);
  assert.equal(s.cycle.stage, 'votacion');
  assert.equal(s.cycle.month, 'Noviembre 2026');
  assert.equal(s.cycle.deadline, t.now() + 3 * DAY, 'el contador usa la fecha límite programada');
  assert.equal(s.activeCount, ACTIVE.length);
  assert.equal(s.votedCount, 0);
  assert.match(t.bad('adminOpen', t.token, 'Diciembre 2026', t.now() + DAY), /etapa actual/);
});

test('validaciones del voto', () => {
  const t = setup(); open(t);
  assert.match(t.bad('vote', 'mv', votes({ colaboracion: 'mv' })), /votar por ti/);
  assert.match(t.bad('vote', 'mv', votes({ colaboracion: 'nb' })), /no está disponible/, 'Noelia está inactiva');
  assert.match(t.bad('vote', 'mv', votes({ respeto: 'sc' })), /no está disponible/, 'Sofía está inactiva');
  assert.match(t.bad('vote', 'sc', votes({})), /equipo activo/);
  assert.match(t.bad('vote', 'nb', votes({})), /equipo activo/);
  const short = votes({ respeto: 'mc' }); short.respeto.reason = 'corto';
  assert.match(t.bad('vote', 'mv', short), /al menos 40/);
  const missing = votes({}); delete missing.comunicacion;
  assert.match(t.bad('vote', 'mv', missing), /Falta tu voto en Comunicación/);
  t.ok('vote', 'mv', votes({ colaboracion: 'rm', respeto: 'mc' }));
  assert.match(t.bad('vote', 'mv', votes({})), /Ya enviaste/);
});

test('el inicio muestra quién ya votó (con ✓) y cuántos de cuántos', () => {
  const t = setup(); open(t);
  t.ok('vote', 'mv', votes({ colaboracion: 'rm' }));
  t.ok('vote', 'mo', votes({ respeto: 'mc' }));
  const s = t.ok('state', null);
  assert.deepEqual(s.votedIds.sort(), ['mo', 'mv']);
  assert.equal(s.votedCount, 2);
  assert.equal(t.ok('state', 'mv').me.voted, true);
  assert.equal(t.ok('state', 'bb').me.voted, false);
});

test('no se puede votar después del plazo; extenderlo lo permite', () => {
  const t = setup(); open(t);
  t.tick(3 * DAY + 1);
  assert.match(t.bad('vote', 'mv', votes({})), /plazo de la votación ya terminó/);
  t.ok('adminExtend', t.token, t.now() + DAY);
  t.ok('vote', 'mv', votes({}));
});

test('anonimato: las papeletas no guardan quién votó', () => {
  const t = setup(); open(t);
  t.ok('vote', 'mv', votes({ colaboracion: 'rm' }));
  for (const b of t.store.db.nom) assert.deepEqual(Object.keys(b).sort(), ['cycle', 'nominee', 'pillar', 'reason']);
  const a = t.ok('admin', t.token);
  assert.ok(!JSON.stringify(a.tally).includes('"mv"'), 'el conteo no menciona a quien votó');
  assert.ok(a.participation.find(p => p.id === 'mv').ts > 0, 'sí registra que participó');
});

test('ganador por pilar: más votos; empate en el primer lugar = pin compartido', () => {
  const t = setup(); open(t);
  // colaboracion: rm 3, et 3, dm 1 -> compartido ; responsabilidad: vc 2, mr 1 ; respeto: mc 5 ; comunicacion: nadie
  [['bb', { colaboracion: 'rm', responsabilidad: 'vc', respeto: 'mc' }],
   ['mb', { colaboracion: 'rm', responsabilidad: 'vc', respeto: 'mc' }],
   ['na', { colaboracion: 'rm', responsabilidad: 'mr', respeto: 'mc' }],
   ['mo', { colaboracion: 'et', respeto: 'mc' }],
   ['pr', { colaboracion: 'et', respeto: 'mc' }],
   ['gc', { colaboracion: 'et' }],
   ['rj', { colaboracion: 'dm' }]].forEach(([v, m]) => t.ok('vote', v, votes(m)));
  const live = t.ok('admin', t.token);
  assert.deepEqual(live.leaders.colaboracion.sort(), ['et', 'rm'], 'el panel muestra quién va ganando');
  assert.equal(t.ok('state', 'bb').winners, null);

  t.ok('adminClose', t.token);
  assert.match(t.bad('vote', 'mv', votes({})), /etapa actual/, 'cerrada no se vota');
  assert.equal(t.ok('state', 'bb').winners, null, 'los ganadores no se ven antes de revelarlos');
  assert.equal(t.ok('state', 'bb').recognitions, null, 'los mensajes no se ven antes de revelar');
  const a = t.ok('admin', t.token);
  assert.deepEqual(a.winners.colaboracion.sort(), ['et', 'rm']);
  assert.deepEqual(a.winners.responsabilidad, ['vc']);
  assert.deepEqual(a.winners.respeto, ['mc']);
  assert.deepEqual(a.winners.comunicacion, []);

  t.ok('adminReveal', t.token);
  const rev = t.ok('state', 'bb');
  assert.deepEqual(rev.winners.respeto.ids, ['mc']);
  assert.equal(rev.winners.respeto.votes, 5);
  assert.equal(rev.winners.respeto.reasons.length, 5, 'muestra todos los motivos del ganador');
  assert.equal(rev.winners.colaboracion.ids.length, 2);
  assert.equal(rev.winners.colaboracion.reasons.length, 6);
  // Todos los reconocidos con sus mensajes, sin quién los escribió
  assert.deepEqual(rev.recognitions.colaboracion.map(x => x.id), ['et', 'rm', 'dm']);
  assert.equal(rev.recognitions.colaboracion.find(x => x.id === 'dm').reasons.length, 1);
  assert.deepEqual(rev.recognitions.comunicacion, [], 'quien no recibió votos no aparece');
  assert.ok(!JSON.stringify(rev.recognitions).match(/"(bb|mb|na|mo|pr|gc|rj)"/), 'no aparece ningún votante');
  assert.equal(t.ok('state', 'bb').recognitions !== null, true);

  t.ok('adminArchive', t.token);
  const after = t.ok('state', 'bb');
  assert.equal(after.cycle.stage, 'idle');
  assert.equal(after.history.length, 1);
  assert.deepEqual(after.history[0].winners.respeto, ['mc']);
  t.ok('adminOpen', t.token, 'Diciembre 2026', t.now() + 3 * DAY);
  assert.equal(t.ok('state', 'bb').me.voted, false, 'el mes nuevo parte de cero');
  assert.equal(t.ok('state', null).votedCount, 0);
});

test('el orden de las etapas no se puede saltar', () => {
  const t = setup();
  assert.match(t.bad('adminClose', t.token), /etapa actual/);
  assert.match(t.bad('adminExtend', t.token, t.now() + DAY), /etapa actual/);
  open(t);
  assert.match(t.bad('adminReveal', t.token), /etapa actual/);
  assert.match(t.bad('adminArchive', t.token), /etapa actual/);
});
