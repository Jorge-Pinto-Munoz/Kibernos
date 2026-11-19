/* La página publicada fuera de Google (Netlify) habla con el Code.gs real por HTTPS.
   Se intercepta el link /exec y se responde con doPost() del Code.gs sobre la Hoja simulada.
   Uso: node scripts/build-dist.js && node qa/netlify.e2e.js */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');
const { makeEnv } = require('./gasmock.js');

(async () => {
  const env = makeEnv(); env.ctx.setup();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let calls = 0;
  await page.route('https://script.google.com/macros/**', async route => {
    const req = route.request();
    assert.equal(req.method(), 'POST');
    assert.match(req.headers()['content-type'], /text\/plain/, 'sin consulta previa de CORS');
    calls++;
    const out = env.ctx.doPost({ postData: { contents: req.postData() } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.content });
  });
  const SITE = 'https://rekonoce-prueba.netlify.app/';
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'dist', 'netlify', 'index.html'), 'utf8');
  await page.route(SITE + '**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(SITE);
  const ready = () => page.waitForFunction(() => window.__rk && !__rk.S.busy && __rk.S.stack[0] !== 'loading', null, { timeout: 8000 });
  const text = async () => { await page.waitForTimeout(150); await ready(); return page.innerText('#app'); };
  await ready();
  let t = await text();
  assert.doesNotMatch(t, /Abre ReKonoce desde su link/); assert.match(t, /No hay una votación abierta/);
  console.log('✓ carga «¿Quién eres?» desde Netlify hablando con Google');
  await page.click('[data-a="toPin"]'); for (const d of '5591') await page.click(`[data-k="${d}"]`); await ready();
  await page.click('[data-s="open"]'); await page.click('[data-a="confirmSheet"]'); await ready();
  assert.match(await text(), /rekonoce-prueba\.netlify\.app/, 'la tarjeta comparte el link de Netlify');
  console.log('✓ el panel muestra el link de Netlify para compartir');
  await page.click('.tabs [data-s="logout"]'); await ready(); await page.waitForTimeout(300);
  assert.match(await text(), /0\s*de 18/);
  console.log('✓ el admin abre la votación y el contador aparece');
  await page.click('[data-id="mo"]'); await page.click('[data-a="accept"]'); await ready();
  for (const [p, w] of [['colaboracion', 'rm'], ['responsabilidad', 'vc'], ['respeto', 'mc']]) {
    await page.click(`[data-p="${p}"]`); await page.click(`[data-id="${w}"]`); await page.click('[data-a="toReason"]');
    await page.fill('#reason', 'Durante todo el mes ayudó a ordenar el trabajo y nos explicó con paciencia cada paso.'); await page.click('#saveR');
  }
  await page.click('[data-p="comunicacion"]'); await page.click('[data-a="skip"]'); await ready();
  await page.click('[data-a="review"]'); await page.click('[data-a="sendNom"]');
  assert.match(await text(), /Tu voto quedó registrado/);
  const part = env.sheets.Participacion.grid.slice(1);
  assert.equal(part.length, 1); assert.equal(part[0][4], 'Manuel Orellana');
  assert.equal(env.sheets.Nominaciones.grid.length - 1, 4);
  console.log('✓ el voto se guarda en la Hoja con nombres completos');
  assert.deepEqual(errors, []);
  console.log(`\nNetlify → Google funciona (${calls} llamadas al servidor).`);
  await browser.close();
})().catch(e => { console.error('✗', e.message.split('\n').slice(0, 5).join('\n')); process.exit(1); });
