/* Recorrido completo a clics, como lo haría una persona. Uso: node qa/build-harness.js && node qa/e2e.js */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');
const URL = 'file://' + path.join(__dirname, 'out', 'harness.html');
const R = 'Durante todo el mes ayudó a ordenar el trabajo y nos explicó con paciencia cada paso.';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.__rk && !__rk.S.busy && __rk.S.stack[0] !== 'loading');
  const text = async () => { await page.waitForTimeout(80); await ready(); await page.waitForTimeout(120); return page.innerText('#app'); };
  const step = async (label, fn) => { await fn(); await ready(); await page.waitForTimeout(120); console.log('✓', label); };

  await page.goto(URL + '#nom'); await ready();
  await step('elige su nombre y ve el aviso de anonimato', async () => {
    await page.fill('#q', 'manuel'); await page.click('[data-id="mo"]');
    assert.match(await text(), /Tu voto es anónimo/);
    await page.click('[data-a="accept"]');
  });
  await step('ve el contador y las 4 categorías', async () => {
    const t = await text();
    assert.match(t, /La nominación cierra en/); assert.match(t, /DÍAS/i); assert.match(t, /Completa los 4 pilares \(0\/4\)/);
  });
  for (const [pid, who] of [['colaboracion', 'mb'], ['responsabilidad', 'vc'], ['respeto', 'mc']]) {
    await step('nomina en ' + pid, async () => {
      await page.click(`[data-p="${pid}"]`);
      assert.equal(await page.isDisabled('[data-id="mo"]'), true, 'no puede nominarse a sí mismo');
      await page.click(`[data-id="${who}"]`); await page.click('[data-a="toReason"]');
      await page.fill('#reason', 'corto');
      assert.equal(await page.isDisabled('#saveR'), true, 'motivo corto no se puede guardar');
      await page.fill('#reason', R); await page.click('#saveR');
    });
  }
  await step('omite comunicación', async () => { await page.click('[data-p="comunicacion"]'); await page.click('[data-a="skip"]'); });
  await step('revisa y envía', async () => {
    await page.click('[data-a="review"]'); await page.click('[data-a="sendNom"]');
    assert.match(await text(), /Ya enviaste tus nominaciones/);
  });
  await step('cambia de persona y entra al panel con PIN incorrecto y luego 5591', async () => {
    await page.click('[data-a="switch"]'); await page.click('[data-a="toPin"]');
    for (const d of '1234') await page.click(`[data-k="${d}"]`);
    await ready(); assert.match(await text(), /PIN incorrecto/);
    for (const d of '5591') await page.click(`[data-k="${d}"]`);
  });
  await step('el panel muestra participación 12/19 y quién falta', async () => {
    assert.match(await text(), /12\s*\/19/);
    await page.click('.tabs [data-s="adminPeople"]'); await ready();
    await page.click('[data-f="missing"]');
    const t = await text(); assert.match(t, /7 personas aún no votan/); assert.doesNotMatch(t, /Manuel Orellana/);
  });
  await step('el panel de votos no revela quién votó', async () => {
    await page.click('.tabs [data-s="adminVotes"]');
    assert.match(await text(), /Por quién se votó/);
  });
  await step('cierra la nominación y anuncia finalistas', async () => {
    await page.click('.tabs [data-s="admin"]'); await ready();
    await page.click('[data-s="toFinal"]'); await page.click('[data-a="confirmSheet"]');
    assert.match(await text(), /Finalistas anunciados/);
  });
  await step('Manuel vota en la final', async () => {
    await page.click('.tabs [data-s="logout"]'); await ready();
    await page.click('[data-id="mo"]'); await page.click('[data-a="accept"]'); await ready();
    for (const pid of ['colaboracion', 'responsabilidad', 'respeto', 'comunicacion']) {
      if (await page.isDisabled(`[data-p="${pid}"]`)) continue;
      await page.click(`[data-p="${pid}"]`); await page.click('.fin:not([disabled])'); await page.click('[data-a="fsave"]');
    }
    await page.click('[data-a="fsend"]'); await ready();
    assert.match(await text(), /Tu voto final quedó registrado/);
  });
  await step('el admin cierra la votación, revela y proyecta', async () => {
    await page.click('[data-a="switch"]'); await page.click('[data-a="toPin"]');
    for (const d of '5591') await page.click(`[data-k="${d}"]`); await ready();
    await page.click('[data-s="toClose"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    await page.click('[data-s="toReveal"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    await page.click('[data-a="adminReveal"]'); await ready();
    await page.waitForSelector('.rv .nm', { timeout: 4000 });
    const t = await text(); assert.match(t, /Champion de Colaboración/i); assert.match(t, /«/);
  });
  await step('recorre los 4 pilares y el resumen', async () => {
    for (let i = 0; i < 4; i++) { await page.click('[data-a="nextReveal"]'); if (i < 3) await page.waitForSelector('.rv .nm', { timeout: 4000 }); }
    assert.match(await text(), /Los Kiber Champions del mes/);
  });
  await step('cierra el mes y queda en el Salón', async () => {
    await page.click('[data-a="exitReveal"]'); await page.click('[data-s="archive"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    assert.match(await text(), /Abrir la nominación del mes/);
  });
  assert.deepEqual(errors, [], 'sin errores de consola');
  console.log('\nRecorrido completo sin errores.');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
