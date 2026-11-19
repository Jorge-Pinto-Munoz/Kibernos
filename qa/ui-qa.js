/* Revisión automática de UI de ReKonoce.
   Recorre cada pantalla y estado en varios tamaños de teléfono y mide:
   desbordes, elementos que se salen de su contenedor, solapes, texto recortado,
   imágenes rotas, objetivos táctiles chicos, contraste y errores de consola.
   Uso: node qa/build-harness.js && node qa/ui-qa.js            (screenshots en qa/screens) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const HARNESS = 'file://' + path.join(__dirname, 'out', 'harness.html');
const VIEWPORTS = process.env.QA_ONLY ? [[390, 844]] : [[320, 640], [360, 740], [390, 844], [430, 932], [1280, 860]];
const SHOT_W = 390;

const draft = who => encodeURIComponent(JSON.stringify({ cycle: 'Noviembre 2026', draft: {
  colaboracion: { nominee: 'mb', reason: 'Conectó al líder técnico con Talent y destrabó un perfil que llevaba semanas abierto.' },
  responsabilidad: { nominee: 'bp', reason: 'Cerró cada proceso del mes a tiempo aunque tenía el doble de vacantes.' },
  respeto: { skip: true },
  comunicacion: { nominee: 'mc', reason: 'Nos mantuvo al tanto de cada cambio del cliente sin que tuviéramos que preguntar nunca.' } }, fdraft: {} }));
const draft2 = encodeURIComponent(JSON.stringify({ cycle: 'Noviembre 2026', draft: { colaboracion: { nominee: 'mb', reason: 'x'.repeat(50) }, respeto: { skip: true } }, fdraft: {} }));

const ui = (code) => async page => { await page.evaluate(code); };
const click = (sel) => async page => { await page.click(sel); await page.waitForTimeout(150); };
const seq = (...fns) => async page => { for (const f of fns) await f(page); };
const typePin = pin => async page => { for (const d of pin) await page.click(`[data-k="${d}"]`); await page.waitForTimeout(300); };

const SCREENS = [
  ['quien-eres', 'nom', null],
  ['quien-eres-busqueda', 'nom', seq(async p => { await p.fill('#q', 'mar'); await p.waitForTimeout(100); })],
  ['quien-eres-sin-votacion', 'idle', null],
  ['quien-eres-cerrada', 'cerrado', null],
  ['quien-eres-revelado', 'revelado', null],
  ['aviso-anonimato', 'nom', click('[data-id="mo"]')],
  ['pin', 'nom', click('[data-a="toPin"]')],
  ['pin-error', 'nom', seq(click('[data-a="toPin"]'), typePin('1111'))],
  ['inicio-votacion', 'nom|mo', null],
  ['inicio-votacion-parcial', 'nom|mo|' + draft2, null],
  ['inicio-votacion-lista', 'nom|mo|' + draft('mo'), null],
  ['inicio-ya-voto', 'nom|rm', null],
  ['inicio-plazo-vencido', 'nom-expired|mo', null],
  ['pilares', 'nom|mo', click('[data-s="pillars"]')],
  ['pilar-responsabilidad', 'nom|mo', seq(click('.tabs [data-s="pillars"]'), click('[data-p="responsabilidad"]'))],
  ['elegir-persona', 'nom|mo', click('[data-p="respeto"]')],
  ['motivo', 'nom|mo', seq(click('[data-p="respeto"]'), click('[data-id="mc"]'), click('[data-a="toReason"]'), async p => { await p.fill('#reason', 'En la retro más difícil del año dejó hablar a todos y frenó las interrupciones.'); })],
  ['revisar-envio', 'nom|mo|' + draft('mo'), click('[data-a="review"]')],
  ['inicio-cerrado', 'cerrado|mo', null],
  ['inicio-revelado', 'revelado|mo', null],
  ['revelacion-cuenta', 'revelado|mo', click('[data-a="startReveal"]')],
  ...[0, 1, 2, 3].map(i => ['revelacion-' + i, 'revelado|mo', seq(click('[data-a="startReveal"]'), ui(`(()=>{const S=__rk.S;S.reveal={i:${i},phase:'show'};__rk.render()})()`))]),
  ['revelacion-resumen', 'revelado|mo', seq(click('[data-a="startReveal"]'), ui(`(()=>{const S=__rk.S;S.reveal={i:4,phase:'show'};__rk.render()})()`))],
  ['ganadores', 'historia|mo', click('[data-s="winners"]')],
  ['inicio-sin-votacion', 'idle|mo', null],
  ['ganadores-vacio', 'idle|mo', click('[data-s="winners"]')],
  ['admin-sin-mes', 'idle|admin', null],
  ['admin-hoja-abrir', 'idle|admin', click('[data-s="open"]')],
  ['admin-hoja-error', 'idle|admin', seq(click('[data-s="open"]'), async p => { await p.fill('#fDate', '2020-01-01T10:00'); }, click('[data-a="confirmSheet"]'))],
  ['admin-votacion', 'nom|admin', null],
  ['admin-participacion', 'nom|admin', click('[data-s="adminPeople"]')],
  ['admin-participacion-faltan', 'nom|admin', seq(click('.tabs [data-s="adminPeople"]'), click('[data-f="missing"]'))],
  ['admin-votos', 'nom|admin', click('.tabs [data-s="adminVotes"]')],
  ['admin-hoja-cerrar', 'nom|admin', click('[data-s="toClose"]')],
  ['admin-hoja-fecha', 'nom|admin', click('[data-s="extend"]')],
  ['admin-cerrado', 'cerrado|admin', null],
  ['admin-votos-cerrado', 'cerrado|admin', click('.tabs [data-s="adminVotes"]')],
  ['admin-hoja-revelar', 'cerrado|admin', click('[data-s="toReveal"]')],
  ['admin-revelado', 'revelado|admin', null]
];

function audit() {
  const out = [];
  const app = document.getElementById('app');
  const AR = app.getBoundingClientRect();
  const desc = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t ? `${s} «${t}»` : s;
  };
  const vis = el => {
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const inFlow = el => { const p = getComputedStyle(el).position; return p === 'static' || p === 'relative'; }; // sticky: el pie fijo flota sobre el contenido a propósito
  const scrollsX = el => { for (let a = el.parentElement; a && a !== app; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const all = [...app.querySelectorAll('*')].filter(el => !(el instanceof SVGElement && el.tagName !== 'svg') && el.tagName !== 'CANVAS' && vis(el));

  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(['desborde-pagina', 'La página tiene scroll horizontal (' + document.documentElement.scrollWidth + 'px)']);

  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > AR.right + 1 || r.left < AR.left - 1) && !scrollsX(el) && !el.closest('.scrim')) out.push(['fuera-del-app', desc(el)]);

    // Hijo que se sale de su contenedor (el bug de la antorcha)
    const parent = el.parentElement;
    if (parent && parent !== app && inFlow(el) && !(el instanceof SVGElement)) {
      const pcs = getComputedStyle(parent);
      if (!pcs.display.startsWith('inline') || pcs.display === 'inline-block' || pcs.display === 'inline-flex') {
        const P = parent.getBoundingClientRect();
        const sx = pcs.overflowX !== 'visible', sy = pcs.overflowY !== 'visible';
        const over = (!sx && (r.left < P.left - 1 || r.right > P.right + 1)) || (!sy && (r.top < P.top - 1 || r.bottom > P.bottom + 1));
        if (over) out.push(['se-sale-del-contenedor', desc(el) + ' dentro de ' + desc(parent)]);
      }
    }
    if (el.tagName === 'IMG') {
      if (!el.complete || !el.naturalWidth) out.push(['imagen-rota', desc(el)]);
      const m = el.closest('.medal');
      if (m) { const M = m.getBoundingClientRect(); if (r.left < M.left - .5 || r.right > M.right + .5 || r.top < M.top - .5 || r.bottom > M.bottom + .5) out.push(['pin-fuera-del-circulo', desc(m)]); }
    }
    // Texto recortado
    const cs = getComputedStyle(el);
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && el.innerText && !el.classList.contains('medal')) out.push(['texto-recortado', desc(el)]);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(['texto-truncado', desc(el)]);
    // Objetivos táctiles
    if (el.matches('button,a,input,select,textarea,[data-a]') && !el.matches('.scrim')) {
      if (r.height < 44 || r.width < 44) out.push(['tactil-chico', desc(el) + ` ${Math.round(r.width)}×${Math.round(r.height)}`]);
    }
  }
  // Solapes entre hermanos
  for (const el of all) {
    if (el.matches('.rings,svg,.faces')) continue; // .faces: caras apiladas a propósito
    const kids = [...el.children].filter(k => vis(k) && inFlow(k) && k.tagName !== 'CANVAS');
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1 && w * h > 4) out.push(['solape', desc(kids[i]) + ' ↔ ' + desc(kids[j])]);
    }
  }
  // Contraste (WCAG AA) de cada texto visible
  const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const bgOf = el => { for (let a = el; a; a = a.parentElement) { const c = parse(getComputedStyle(a).backgroundColor); if (c.length === 3 || c[3] > .5) return c; } return [255, 255, 255]; };
  for (const el of all) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own || el.closest('[disabled]')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
    const large = size >= 24 || (size >= 18.66 && bold);
    const decorGreen = fg[0] === 178 && fg[1] === 213 && fg[2] === 173 && size >= 20; // regla v3: cifras grandes en verde
    if (!decorGreen && ratio < (large ? 3 : 4.5)) out.push(['contraste', desc(el) + ' ' + ratio.toFixed(2) + ':1']);
  }
  if (!document.fonts.check('600 16px Poppins')) out.push(['fuente', 'Poppins no cargó']);
  return [...new Map(out.map(x => [x.join('|'), x])).values()];
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    for (let n = 0; n < SCREENS.length; n++) {
      const [name, scen, nav] = SCREENS[n];
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(HARNESS + '#' + scen);
      await page.waitForFunction(() => window.__rk && __rk.S.stack[0] !== 'loading', null, { timeout: 8000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      if (process.env.QA_INJECT_CSS) await page.addStyleTag({ content: process.env.QA_INJECT_CSS }); // autoprueba del revisor
      try { if (nav) await nav(page); } catch (e) { errors.push('navegación: ' + e.message.split('\n')[0]); }
      await page.waitForTimeout(250);
      const issues = await page.evaluate(audit);
      errors.forEach(e => issues.push(['error-consola', e]));
      if (issues.length) (report[name] = report[name] || []).push(...issues.map(i => [w, ...i]));
      if (w === SHOT_W) await page.screenshot({ path: path.join(__dirname, 'screens', String(n + 1).padStart(2, '0') + '-' + name + '.png'), fullPage: false });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  const names = Object.keys(report);
  let md = `# QA de UI · ReKonoce\n\n${SCREENS.length} pantallas × ${VIEWPORTS.length} tamaños (${VIEWPORTS.map(v => v[0]).join(', ')} px).\n\n`;
  if (!names.length) md += 'Sin problemas detectados.\n';
  for (const n of names) {
    md += `## ${n}\n`;
    const seen = new Map();
    report[n].forEach(([w, t, d]) => { const k = t + ' · ' + d; seen.set(k, (seen.get(k) || []).concat(w)); });
    for (const [k, ws] of seen) md += `- ${k} (${[...new Set(ws)].join(', ')} px)\n`;
  }
  fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md);
  const total = names.reduce((a, n) => a + report[n].length, 0);
  console.log(md.slice(0, 6000));
  console.log(`\n${total} hallazgos en ${names.length} pantallas`);
  process.exitCode = total ? 1 : 0;
})();
