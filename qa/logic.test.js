/* Pruebas de la lógica de Rekonoce. Ejecutar: node --test qa/ */
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
function noms(map) { // map: {pillar: nomineeId | null}
  const o = {};
  PILLARS.forEach(p => { o[p] = map[p] ? { nominee: map[p], reason: R } : { skip: true }; });
  return o;
}
function openCycle(t) { t.ok('adminOpen', t.token, 'Noviembre 2026', t.now() + 3 * DAY); }

test('PIN: correcto entrega token, incorrecto falla y bloquea tras 5 intentos', () => {
  const t = setup();
  assert.match(t.bad('adminLogin', '0000'), /PIN incorrecto/);
  for (let i = 0; i < 3; i++) t.bad('adminLogin', '1111');
  t.bad('adminLogin', '2222');
  assert.match(t.bad('adminLogin', '5591'), /Demasiados intentos/);
});

test('acciones de administrador exigen token válido', () => {
  const t = setup();
  assert.match(t.bad('admin', 'token-falso'), /sesión de administrador/);
  assert.match(t.bad('adminOpen', null, 'Noviembre 2026', t.now() + DAY), /sesión de administrador/);
});

test('abrir nominación valida mes y fecha futura', () => {
  const t = setup();
  assert.match(t.bad('adminOpen', t.token, '', t.now() + DAY), /mes/);
  assert.match(t.bad('adminOpen', t.token, 'Noviembre 2026', t.now() - 1000), /fecha y hora futura/);
  openCycle(t);
  const s = t.ok('state', 'mv');
  assert.equal(s.cycle.stage, 'nominacion');
  assert.equal(s.cycle.month, 'Noviembre 2026');
  assert.equal(s.activeCount, 18);
  assert.equal(s.finalists, null, 'no hay finalistas durante la nominación');
  assert.match(t.bad('adminOpen', t.token, 'Diciembre 2026', t.now() + DAY), /etapa actual/);
});

test('validaciones de la nominación', () => {
  const t = setup(); openCycle(t);
  assert.match(t.bad('nominate', 'mv', noms({ colaboracion: 'mv' })), /nominarte a ti/);
  assert.match(t.bad('nominate', 'mv', noms({ colaboracion: 'nb' })), /no está disponible/, 'Noelia está inactiva');
  assert.match(t.bad('nominate', 'nb', noms({})), /equipo activo/);
  assert.match(t.bad('nominate', 'zz', noms({})), /equipo activo/);
  const short = noms({ respeto: 'mc' }); short.respeto.reason = 'corto';
  assert.match(t.bad('nominate', 'mv', short), /al menos 40/);
  const missing = noms({}); delete missing.comunicacion;
  assert.match(t.bad('nominate', 'mv', missing), /Falta tu nominación en Comunicación/);
  t.ok('nominate', 'mv', noms({ colaboracion: 'rm', respeto: 'mc' }));
  assert.match(t.bad('nominate', 'mv', noms({})), /Ya enviaste/);
});

test('no se puede nominar después del plazo', () => {
  const t = setup(); openCycle(t);
  t.tick(3 * DAY + 1);
  assert.match(t.bad('nominate', 'mv', noms({})), /plazo de nominación ya terminó/);
  t.ok('adminExtend', t.token, t.now() + DAY);
  t.ok('nominate', 'mv', noms({}));
});

test('anonimato: las papeletas no guardan quién votó', () => {
  const t = setup(); openCycle(t);
  t.ok('nominate', 'mv', noms({ colaboracion: 'rm' }));
  for (const b of t.store.db.nom) {
    assert.deepEqual(Object.keys(b).sort(), ['cycle', 'nominee', 'pillar', 'reason']);
  }
  const admin = t.ok('admin', t.token);
  const json = JSON.stringify(admin.nomTally);
  assert.ok(!json.includes('"mv"'), 'el conteo no menciona a quien votó');
  assert.equal(admin.participation.find(p => p.id === 'mv').nom > 0, true, 'sí registra que participó');
});

test('finalistas: top 3 y empate en el tercer lugar pasa completo', () => {
  const t = setup(); openCycle(t);
  // colaboracion: rm 4, et 3, dm 2, bp 2  -> empate en 3er lugar: rm, et, dm, bp
  const plan = ['rm', 'rm', 'rm', 'rm', 'et', 'et', 'et', 'dm', 'dm', 'bp', 'bp'];
  const voters = ACTIVE.filter(v => !['rm', 'et', 'dm', 'bp', 'mc'].includes(v));
  voters.slice(0, plan.length).forEach((v, i) => t.ok('nominate', v, noms({ colaboracion: plan[i], respeto: 'mc' })));
  const preview = t.ok('admin', t.token).preview;
  assert.deepEqual(preview.colaboracion, ['rm', 'et', 'bp', 'dm']);
  assert.deepEqual(preview.respeto, ['mc'], 'solo hay una persona nominada en Respeto');
  assert.deepEqual(preview.comunicacion, [], 'nadie nominado en Comunicación');
});

test('ciclo completo: finalistas, voto final, ganador con desempate y pin compartido', () => {
  const t = setup(); openCycle(t);
  // colaboracion: rm 3, et 3, dm 1 ; responsabilidad: vc 2, mr 1 ; respeto: mc 5
  const rows = [
    ['bb', { colaboracion: 'rm', responsabilidad: 'vc', respeto: 'mc' }],
    ['mb', { colaboracion: 'rm', responsabilidad: 'vc', respeto: 'mc' }],
    ['na', { colaboracion: 'rm', responsabilidad: 'mr', respeto: 'mc' }],
    ['mo', { colaboracion: 'et', respeto: 'mc' }],
    ['pr', { colaboracion: 'et', respeto: 'mc' }],
    ['gc', { colaboracion: 'et' }],
    ['sc', { colaboracion: 'dm' }]
  ];
  rows.forEach(([v, m]) => t.ok('nominate', v, noms(m)));
  assert.match(t.bad('vote', 'bb', {}), /etapa actual/);
  t.ok('adminCloseNom', t.token, t.now() + 2 * DAY);
  const s = t.ok('state', 'rm');
  assert.equal(s.cycle.stage, 'finalistas');
  assert.deepEqual(s.finalists.colaboracion.map(f => f.id), ['et', 'rm', 'dm']);
  assert.ok(s.finalists.colaboracion[0].excerpt.length >= 40, 'cada finalista trae un motivo anónimo');
  assert.equal(s.finalists.comunicacion.length, 0);
  assert.match(t.bad('nominate', 'mv', noms({})), /etapa actual/);

  // Voto final: rm no puede votarse; Comunicación no tiene finalistas y no se exige
  assert.match(t.bad('vote', 'rm', { colaboracion: 'rm', responsabilidad: 'vc', respeto: 'mc' }), /No puedes votar por ti/);
  assert.match(t.bad('vote', 'bb', { colaboracion: 'mo', responsabilidad: 'vc', respeto: 'mc' }), /no es finalista/);
  assert.match(t.bad('vote', 'bb', { colaboracion: 'rm', respeto: 'mc' }), /Falta tu voto en Responsabilidad/);
  // mc es la única finalista de Respeto: ella no tiene a quién votar ahí y no se le exige
  t.ok('vote', 'mc', { colaboracion: 'rm', responsabilidad: 'vc' });
  // Colaboración: rm 2, et 2 -> empate; desempata nominación (rm 3 = et 3) -> pin compartido
  t.ok('vote', 'bb', { colaboracion: 'et', responsabilidad: 'vc', respeto: 'mc' });
  t.ok('vote', 'mb', { colaboracion: 'et', responsabilidad: 'mr', respeto: 'mc' });
  t.ok('vote', 'na', { colaboracion: 'rm', responsabilidad: 'mr', respeto: 'mc' });
  assert.match(t.bad('vote', 'na', { colaboracion: 'rm', responsabilidad: 'mr', respeto: 'mc' }), /Ya enviaste/);

  t.ok('adminCloseFinal', t.token);
  const closed = t.ok('state', 'bb');
  assert.equal(closed.winners, null, 'los ganadores no se ven antes de revelarlos');
  // Responsabilidad: vc 2, mr 2 en la final -> desempata nominación: vc 2 > mr 1 -> gana vc
  const a = t.ok('admin', t.token);
  assert.deepEqual(a.winners.responsabilidad, ['vc']);
  assert.deepEqual(a.winners.colaboracion.sort(), ['et', 'rm']);
  assert.deepEqual(a.winners.comunicacion, []);

  t.ok('adminReveal', t.token);
  const rev = t.ok('state', 'bb');
  assert.deepEqual(rev.winners.respeto.ids, ['mc']);
  assert.equal(rev.winners.respeto.reasons.length, 5, 'muestra todos los motivos del ganador');
  assert.equal(rev.winners.colaboracion.ids.length, 2);

  t.ok('adminArchive', t.token);
  const after = t.ok('state', 'bb');
  assert.equal(after.cycle.stage, 'idle');
  assert.equal(after.history.length, 1);
  assert.deepEqual(after.history[0].winners.respeto, ['mc']);
  // Se puede abrir el mes siguiente y la participación parte de cero
  t.ok('adminOpen', t.token, 'Diciembre 2026', t.now() + 3 * DAY);
  assert.equal(t.ok('state', 'bb').me.votedNom, false);
});

test('el orden de las etapas no se puede saltar', () => {
  const t = setup();
  assert.match(t.bad('adminCloseNom', t.token, t.now() + DAY), /etapa actual/);
  openCycle(t);
  assert.match(t.bad('adminCloseFinal', t.token), /etapa actual/);
  assert.match(t.bad('adminReveal', t.token), /etapa actual/);
  assert.match(t.bad('adminArchive', t.token), /etapa actual/);
});
