const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 180000 });
  const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errs = [];
  for (const [tag, p] of [['A', A], ['B', B]]) {
    await p.setViewport({ width: 390, height: 844 });
    p.on('pageerror', e => errs.push(tag + ' PAGEERR ' + e.message.slice(0, 150)));
    p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' CONSOLE ' + m.text().slice(0, 150)); });
    p.on('requestfailed', r => errs.push(tag + ' REQFAIL ' + r.url().slice(0, 90) + ' ' + (r.failure()?.errorText || '')));
    p.on('response', r => { if (r.status() >= 400) errs.push(tag + ' HTTP' + r.status() + ' ' + r.url().slice(0, 90)); });
  }
  const suf = Date.now() % 10000;
  await A.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#name');
  await A.type('#name', 'Andi' + suf); await A.click('#go');
  await A.waitForSelector('#create'); await A.click('#create');
  await A.waitForSelector('.code'); const code = await A.$eval('.code', e => e.textContent.trim());
  await A.screenshot({ path: 'test/shots/a-pair.png' });
  await B.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#name');
  await B.type('#name', 'Bella' + suf); await B.click('#go');
  await B.waitForSelector('#code'); await B.type('#code', code); await B.click('#join');
  await B.waitForSelector('#ainame', { timeout: 10000 });
  await B.type('#ainame', 'Bintang'); await B.click('#start');
  await B.waitForSelector('#wface', { timeout: 10000 });
  await sleep(1200);
  console.log("step:watch");
  // WATCH apps tour — open every icon
  await B.click('#wface'); await sleep(400);
  const iconCount = (await B.$$('.wicon')).length;
  for (let i = 0; i < iconCount; i++) {
    await B.click('#wface').catch(() => {}); await sleep(200);
    const icons = await B.$$('.wicon');
    if (!icons[i]) continue;
    await icons[i].click(); await sleep(700);
    await B.screenshot({ path: `test/shots/a-wapp${i}.png` });
    const wb = await B.$('#wback'); if (wb) await wb.click(); await sleep(250);
  }
  console.log("step:miss");
  // miss send B->A via tab
  await B.click('[data-t="miss"]'); await sleep(500);
  await B.evaluate(() => document.querySelector('#missBig').click()); await sleep(300);
  await B.evaluate(() => document.querySelector('#missBig').click()); await sleep(1600);
  await B.screenshot({ path: 'test/shots/a-miss.png' });
  console.log("step:map");
  // map
  await B.click('[data-t="map"]'); await sleep(1800);
  await B.screenshot({ path: 'test/shots/a-map.png' });
  console.log("step:sched");
  // sched add
  await B.click('[data-t="sched"]'); await sleep(400);
  await B.evaluate(() => { document.querySelector('#st').value = 'Nonton drakor bareng'; });
  await B.click('#sadd'); await sleep(700);
  await B.screenshot({ path: 'test/shots/a-sched.png' });
  console.log("step:ai");
  // AI
  await B.click('[data-t="ai"]'); await sleep(500);
  await B.screenshot({ path: 'test/shots/a-ai.png' });
  console.log("step:aiprof");
  // AI profile
  await B.click('#aiprof'); await sleep(400);
  await B.screenshot({ path: 'test/shots/a-aiprof.png' });
  await B.evaluate(() => document.querySelector('#cls3')?.click()); await sleep(200);
  console.log("step:wpaper");
  // wallpaper
  await B.click('[data-t="watch"]'); await sleep(300);
  const wp = await B.$('#wpaperBtn'); if (wp) await wp.click(); await sleep(500);
  await B.screenshot({ path: 'test/shots/a-wpaper.png' });
  const c2 = await B.$('#cls3'); if (c2) await c2.click(); await sleep(200);
  // settings + history
  await B.click('#gear'); await sleep(400);
  await B.screenshot({ path: 'test/shots/a-set.png' });
  const hist = await B.$('#hist'); if (hist) { await hist.click(); await sleep(500); await B.screenshot({ path: 'test/shots/a-hist.png' }); }
  // A side — did miss arrive?
  await A.reload({ waitUntil: 'domcontentloaded' }); await sleep(2000);
  await A.screenshot({ path: 'test/shots/a-Aside.png' });
  // small phone 360x740
  const S = await ctxB.newPage();
  await S.setViewport({ width: 360, height: 740 });
  S.on('pageerror', e => errs.push('S PAGEERR ' + e.message.slice(0, 150)));
  await S.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await sleep(800); await S.screenshot({ path: 'test/shots/a-small.png' });
  // overflow check on all tabs
  await B.click('[data-t="watch"]'); await sleep(300);
  for (const t of ['watch', 'map', 'sched', 'miss', 'ai']) {
    await B.click(`[data-t="${t}"]`); await sleep(600);
    const ov = await B.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    if (ov.sw > ov.iw) errs.push(`OVERFLOW tab ${t}: scrollWidth ${ov.sw} > ${ov.iw}`);
  }
  console.log('errors:', errs.length); errs.forEach(e => console.log(' -', e));
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
