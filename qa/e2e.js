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
  const pin = async code => { for (const d of code) await page.click(`[data-k="${d}"]`); };

  await page.goto(URL + '#idle'); await ready();
  await step('sin votación abierta, «¿Quién eres?» lo dice y no muestra pines', async () => {
    const t = await text();
    assert.match(t, /ReKonoce/); assert.match(t, /No hay una votación abierta/);
    assert.equal(await page.locator('.pins2').count(), 0);
  });
  await step('el admin abre la votación de noviembre con fecha límite', async () => {
    await page.click('[data-a="toPin"]'); await pin('5591'); await ready();
    await page.click('[data-s="open"]'); await page.click('[data-a="confirmSheet"]');
    assert.match(await text(), /Votación de .* abierta/);
    await page.click('.tabs [data-s="logout"]');
  });
  await step('«¿Quién eres?» muestra el contador y 0 de 18', async () => {
    const t = await text();
    assert.match(t, /Cierra en/); assert.match(t, /DÍAS/i); assert.match(t, /0\s*de 18/);
  });
  await step('elige su nombre, ve el aviso y puede volver atrás', async () => {
    await page.fill('#q', 'manuel'); await page.click('[data-id="mo"]');
    assert.match(await text(), /Tu voto es anónimo/);
    await page.click('[data-a="accept"]'); await ready();
    await page.click('[data-a="switch"]');
    assert.match(await text(), /¿Quién eres\?/);
    await page.fill('#q', 'manuel'); await page.click('[data-id="mo"]'); await page.click('[data-a="accept"]');
  });
  for (const [pid, who] of [['colaboracion', 'mb'], ['responsabilidad', 'vc'], ['respeto', 'mc']]) {
    await step('vota en ' + pid, async () => {
      await page.click(`[data-p="${pid}"]`);
      assert.equal(await page.isDisabled('[data-id="mo"]'), true, 'no puede votar por sí mismo');
      await page.click(`[data-id="${who}"]`); await page.click('[data-a="toReason"]');
      await page.fill('#reason', 'corto');
      assert.equal(await page.isDisabled('#saveR'), true, 'motivo corto no se puede guardar');
      await page.fill('#reason', R); await page.click('#saveR');
    });
  }
  await step('omite comunicación, revisa y envía', async () => {
    await page.click('[data-p="comunicacion"]'); await page.click('[data-a="skip"]'); await ready();
    await page.click('[data-a="review"]'); await page.click('[data-a="sendNom"]');
    const t = await text(); assert.match(t, /Tu voto quedó registrado/); assert.doesNotMatch(t, /Cierra en/);
  });
  await step('en Ganadores ve su propio voto (solo en su teléfono) y no hay ganadores aún', async () => {
    await page.click('.tabs [data-s="winners"]'); const t = await text();
    assert.match(t, /Tu voto de noviembre/i); assert.match(t, /Nadie más puede ver por quién votaste/);
    await page.click('.tabs [data-s="home"]'); await ready();
  });
  await step('al volver, Manuel aparece con ✓ en la lista', async () => {
    await page.click('[data-a="switch"]'); await ready();
    assert.equal(await page.locator('[data-id="mo"] .tick').count(), 1);
    assert.match(await text(), /1\s*de 18/);
    assert.equal(await page.locator('[data-id="bb"] .tick').count(), 0);
  });
  await step('el admin ve participación 1/18, quién falta y quién va ganando', async () => {
    await page.click('[data-a="toPin"]'); await pin('1234'); await ready();
    assert.match(await text(), /PIN incorrecto/);
    await pin('5591'); await ready();
    assert.match(await text(), /1\s*\/18/);
    await page.click('.tabs [data-s="adminPeople"]'); await ready(); await page.click('[data-f="missing"]');
    const t = await text(); assert.match(t, /17 personas aún no votan/); assert.doesNotMatch(t, /Manuel Orellana/);
    await page.click('.tabs [data-s="adminVotes"]');
    assert.match(await text(), /va ganando/);
  });
  await step('cierra la votación, revela y proyecta', async () => {
    await page.click('.tabs [data-s="admin"]'); await ready();
    await page.click('[data-s="toClose"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    await page.click('[data-s="toReveal"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    await page.click('[data-a="adminReveal"]'); await ready();
    await page.waitForSelector('.rv .nm', { timeout: 4000 });
    const t = await text(); assert.match(t, /Champion de Colaboración/i); assert.match(t, /«/);
  });
  await step('recorre los 4 pilares y el resumen', async () => {
    for (let i = 0; i < 4; i++) { await page.click('[data-a="nextReveal"]'); if (i < 3) await page.waitForSelector('.rv .nm, .rv .lead', { timeout: 4000 }); }
    assert.match(await text(), /Los Kiber Champions del mes/);
  });
  await step('toca a un ganador y lee lo que le escribieron; luego ve a todos los reconocidos', async () => {
    await page.click('.wrow.tap'); let t = await text();
    assert.match(t, /Lo que le escribieron/i); assert.match(t, /«/); assert.match(t, /nunca muestran quién/);
    await page.click('[data-a="back"]'); await ready();
    await page.click('[data-a="allRecog"]'); t = await text();
    assert.match(t, /Todos los reconocidos/); assert.match(t, /reconocimiento/);
    await page.click('.person[data-a="recog"]'); assert.match(await text(), /Lo que le escribieron/i);
    await page.click('[data-a="back"]'); await ready(); await page.click('[data-a="back"]'); await ready();
  });
  await step('cierra el mes y queda listo para el siguiente', async () => {
    await page.click('[data-a="exitReveal"]'); await page.click('[data-s="archive"]'); await page.click('[data-a="confirmSheet"]'); await ready();
    assert.match(await text(), /Abrir la votación del mes/);
  });
  assert.deepEqual(errors, [], 'sin errores de consola');
  console.log('\nRecorrido completo sin errores.');
  await browser.close();
})().catch(e => { console.error('✗', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
