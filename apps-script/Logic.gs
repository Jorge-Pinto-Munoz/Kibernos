/**
 * Rekonoce · lógica de negocio pura.
 *
 * No usa ningún servicio de Google: recibe un "store" (dónde se guardan los datos)
 * y un "auth" (tokens de administrador). Así la misma lógica corre en Apps Script
 * (Code.gs, con Google Sheets) y en las pruebas locales (qa/, con memoria).
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
  var STAGES = ['idle', 'nominacion', 'finalistas', 'cerrado', 'revelado'];
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

  /** Las 3 personas más nominadas por pilar. Si hay empate en el 3er lugar, pasan todas las empatadas. */
  function computeFinalists(nomBallots, people) {
    var idx = peopleIndex(people);
    var out = {};
    PILLARS.forEach(function (pid) {
      var t = tally(nomBallots, pid, idx).filter(function (x) { return idx[x.id] && idx[x.id].active; });
      if (!t.length) { out[pid] = []; return; }
      var cut = t[Math.min(2, t.length - 1)].votes;
      out[pid] = t.filter(function (x) { return x.votes >= cut; }).map(function (x) { return x.id; });
    });
    return out;
  }

  /** Ganador por pilar: más votos finales; empate, más votos en nominación; si sigue, pin compartido. */
  function computeWinners(finBallots, nomBallots, finalists, people) {
    var idx = peopleIndex(people);
    var out = {};
    PILLARS.forEach(function (pid) {
      var nom = {};
      tally(nomBallots, pid, idx).forEach(function (x) { nom[x.id] = x.votes; });
      var fin = {};
      tally(finBallots, pid, idx).forEach(function (x) { fin[x.id] = x.votes; });
      var rank = (finalists[pid] || []).map(function (id) {
        return { id: id, final: fin[id] || 0, nom: nom[id] || 0 };
      }).sort(function (a, b) { return (b.final - a.final) || (b.nom - a.nom); });
      var top = rank.length ? rank.filter(function (r) {
        return r.final === rank[0].final && r.nom === rank[0].nom;
      }) : [];
      out[pid] = { winners: top.map(function (r) { return r.id; }), votes: top.length ? top[0].final : 0, rank: rank };
    });
    return out;
  }

  function reasonsFor(nomBallots, pillar, id) {
    return nomBallots.filter(function (b) { return b.pillar === pillar && b.nominee === id && b.reason; })
      .map(function (b) { return b.reason; });
  }

  function participationMap(rows, stage) {
    var m = {};
    rows.forEach(function (r) { if (r.stage === stage) m[r.person] = r.ts; });
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
    var part = cfg.cycleId ? store.getParticipation(cfg.cycleId) : [];
    var nomMap = participationMap(part, 'nom');
    var finMap = participationMap(part, 'fin');
    var st = cfg.stage || 'idle';
    var state = {
      serverNow: now,
      people: people.map(function (p) { return { id: p.id, name: p.name, area: p.area, note: p.note, active: p.active }; }),
      cycle: { month: cfg.month || '', stage: st, nomDeadline: cfg.nomDeadline || null, finDeadline: cfg.finDeadline || null },
      activeCount: active.length,
      counts: {
        nom: active.filter(function (p) { return nomMap[p.id]; }).length,
        fin: active.filter(function (p) { return finMap[p.id]; }).length
      },
      me: null,
      finalists: null,
      winners: null,
      history: store.getHistory()
    };
    if (personId && idx[personId]) {
      state.me = { id: personId, votedNom: !!nomMap[personId], votedFin: !!finMap[personId] };
    }
    if (st === 'finalistas' || st === 'cerrado' || st === 'revelado') {
      var nomB = store.getBallots('nom', cfg.cycleId);
      var fs = cfg.finalists || {};
      state.finalists = {};
      PILLARS.forEach(function (pid) {
        state.finalists[pid] = (fs[pid] || []).map(function (id) {
          var rs = reasonsFor(nomB, pid, id);
          return { id: id, excerpt: rs.length ? rs[0] : '' };
        });
      });
      if (st === 'revelado' && cfg.winners) {
        state.winners = {};
        PILLARS.forEach(function (pid) {
          var w = cfg.winners[pid] || { winners: [], votes: 0 };
          var reasons = [];
          w.winners.forEach(function (id) { reasons = reasons.concat(reasonsFor(nomB, pid, id)); });
          state.winners[pid] = { ids: w.winners, votes: w.votes, reasons: reasons };
        });
      }
    }
    return state;
  }

  /* ---------- Votar ---------- */
  function nominate(store, personId, noms, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var me = idx[personId];
    if (!me || !me.active) fail('No encontramos tu nombre en el equipo activo.');
    requireStage(cfg, 'nominacion');
    if (now > cfg.nomDeadline) fail('El plazo de nominación ya terminó.');
    var part = store.getParticipation(cfg.cycleId);
    if (participationMap(part, 'nom')[personId]) fail('Ya enviaste tus nominaciones este mes.');
    if (!noms || typeof noms !== 'object') fail('Faltan tus nominaciones.');
    var rows = [];
    PILLARS.forEach(function (pid) {
      var n = noms[pid];
      if (!n) fail('Falta tu nominación en ' + PILLAR_NAMES[pid] + '.');
      if (n.skip) { rows.push({ pillar: pid, nominee: '', reason: '' }); return; }
      var target = idx[n.nominee];
      if (!target || !target.active) fail('La persona elegida en ' + PILLAR_NAMES[pid] + ' no está disponible.');
      if (n.nominee === personId) fail('No puedes nominarte a ti mismo.');
      var reason = String(n.reason || '').replace(/\s+/g, ' ').trim();
      if (reason.length < MIN_REASON) fail('El motivo en ' + PILLAR_NAMES[pid] + ' necesita al menos ' + MIN_REASON + ' caracteres.');
      if (reason.length > MAX_REASON) fail('El motivo en ' + PILLAR_NAMES[pid] + ' supera los ' + MAX_REASON + ' caracteres.');
      rows.push({ pillar: pid, nominee: n.nominee, reason: reason });
    });
    store.addBallots('nom', cfg.cycleId, rows);
    store.addParticipation(cfg.cycleId, 'nom', personId, now);
    return publicState(store, personId, now);
  }

  function vote(store, personId, votes, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var me = idx[personId];
    if (!me || !me.active) fail('No encontramos tu nombre en el equipo activo.');
    requireStage(cfg, 'finalistas');
    if (now > cfg.finDeadline) fail('El plazo de la votación final ya terminó.');
    var part = store.getParticipation(cfg.cycleId);
    if (participationMap(part, 'fin')[personId]) fail('Ya enviaste tu voto final.');
    var rows = [];
    PILLARS.forEach(function (pid) {
      var eligible = (cfg.finalists[pid] || []).filter(function (id) { return id !== personId; });
      var v = votes ? votes[pid] : null;
      if (!eligible.length) { rows.push({ pillar: pid, nominee: '' }); return; }
      if (!v) fail('Falta tu voto en ' + PILLAR_NAMES[pid] + '.');
      if (v === personId) fail('No puedes votar por ti.');
      if (eligible.indexOf(v) < 0) fail('Esa persona no es finalista en ' + PILLAR_NAMES[pid] + '.');
      rows.push({ pillar: pid, nominee: v });
    });
    store.addBallots('fin', cfg.cycleId, rows);
    store.addParticipation(cfg.cycleId, 'fin', personId, now);
    return publicState(store, personId, now);
  }

  /* ---------- Administrador ---------- */
  function adminState(store, now) {
    var cfg = store.getConfig();
    var people = store.getPeople();
    var idx = peopleIndex(people);
    var st = cfg.stage || 'idle';
    var part = cfg.cycleId ? store.getParticipation(cfg.cycleId) : [];
    var nomMap = participationMap(part, 'nom');
    var finMap = participationMap(part, 'fin');
    var out = {
      serverNow: now,
      cycle: { month: cfg.month || '', stage: st, nomDeadline: cfg.nomDeadline || null, finDeadline: cfg.finDeadline || null },
      participation: activePeople(people).map(function (p) {
        return { id: p.id, nom: nomMap[p.id] || null, fin: finMap[p.id] || null };
      }),
      nomTally: null, finTally: null, preview: null, finalists: cfg.finalists || null, winners: null
    };
    if (st !== 'idle' && cfg.cycleId) {
      var nomB = store.getBallots('nom', cfg.cycleId);
      out.nomTally = {};
      PILLARS.forEach(function (pid) {
        out.nomTally[pid] = {
          rows: tally(nomB, pid, idx),
          skips: nomB.filter(function (b) { return b.pillar === pid && !b.nominee; }).length
        };
      });
      if (st === 'nominacion') out.preview = computeFinalists(nomB, people);
      if (st !== 'nominacion') {
        var finB = store.getBallots('fin', cfg.cycleId);
        out.finTally = {};
        PILLARS.forEach(function (pid) {
          var t = tally(finB, pid, idx);
          var m = {};
          t.forEach(function (x) { m[x.id] = x.votes; });
          out.finTally[pid] = (cfg.finalists[pid] || []).map(function (id) { return { id: id, votes: m[id] || 0 }; })
            .sort(function (a, b) { return b.votes - a.votes; });
        });
      }
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
      cycleId: 'c' + now + '-' + Math.random().toString(36).slice(2, 8), month: month, stage: 'nominacion',
      nomDeadline: ts, finDeadline: null, finalists: null, winners: null
    });
  }

  function adminCloseNom(store, deadline, now) {
    var cfg = store.getConfig();
    requireStage(cfg, 'nominacion');
    var ts = validDeadline(deadline, now);
    var finalists = computeFinalists(store.getBallots('nom', cfg.cycleId), store.getPeople());
    store.setConfig({ stage: 'finalistas', finalists: finalists, finDeadline: ts });
  }

  function adminCloseFinal(store, now) {
    var cfg = store.getConfig();
    requireStage(cfg, 'finalistas');
    var winners = computeWinners(store.getBallots('fin', cfg.cycleId), store.getBallots('nom', cfg.cycleId), cfg.finalists, store.getPeople());
    store.setConfig({ stage: 'cerrado', winners: winners });
  }

  function adminReveal(store) {
    requireStage(store.getConfig(), 'cerrado');
    store.setConfig({ stage: 'revelado' });
  }

  function adminExtend(store, deadline, now) {
    var cfg = store.getConfig();
    var ts = validDeadline(deadline, now);
    if (cfg.stage === 'nominacion') store.setConfig({ nomDeadline: ts });
    else if (cfg.stage === 'finalistas') store.setConfig({ finDeadline: ts });
    else fail('Solo puedes cambiar la fecha límite con una votación abierta.');
  }

  function adminArchive(store) {
    var cfg = store.getConfig();
    requireStage(cfg, 'revelado');
    var w = {};
    PILLARS.forEach(function (pid) { w[pid] = (cfg.winners[pid] || { winners: [] }).winners; });
    store.addHistory({ month: cfg.month, winners: w });
    store.setConfig({ cycleId: '', month: '', stage: 'idle', nomDeadline: null, finDeadline: null, finalists: null, winners: null });
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
        case 'nominate': data = nominate(store, args[0], args[1], now); break;
        case 'vote': data = vote(store, args[0], args[1], now); break;
        case 'adminLogin':
          if (auth.fails() >= MAX_PIN_FAILS) fail('Demasiados intentos. Espera 10 minutos.');
          if (String(args[0]) !== String(store.getAdminPin())) { auth.addFail(); fail('PIN incorrecto. Intenta de nuevo.'); }
          auth.resetFails();
          data = { token: auth.issue() };
          break;
        case 'admin': admin(); data = adminState(store, now); break;
        case 'adminOpen': admin(); adminOpen(store, args[1], args[2], now); data = adminState(store, now); break;
        case 'adminCloseNom': admin(); adminCloseNom(store, args[1], now); data = adminState(store, now); break;
        case 'adminCloseFinal': admin(); adminCloseFinal(store, now); data = adminState(store, now); break;
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
    tally: tally, computeFinalists: computeFinalists, computeWinners: computeWinners,
    publicState: publicState, adminState: adminState, handle: handle
  };
})();
