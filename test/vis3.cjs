const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new' });
  const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) {
    await p.setViewport({ width: 390, height: 844 });
    p.on('pageerror', e => console.log('PAGEERR', e.message));
    p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 140)); });
  }
  const suf = Date.now() % 10000;
  // A register + create pair
  await A.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#name');
  await A.screenshot({ path: 'test/shots/v3-auth.png' });
  await A.type('#name', 'Andi' + suf); await A.click('#go');
  await A.waitForSelector('#create'); await A.click('#create');
  await A.waitForSelector('.code'); const code = await A.$eval('.code', e => e.textContent.trim());
  console.log('CODE:', code);
  await A.screenshot({ path: 'test/shots/v3-pair.png' });
  // B register + join
  await B.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#name');
  await B.type('#name', 'Bella' + suf); await B.click('#go');
  await B.waitForSelector('#code'); await B.type('#code', code.replace('-', ''));
  await B.click('#join');
  // B: setup screen (onboarding)
  await B.waitForSelector('#ainame', { timeout: 10000 });
  await B.screenshot({ path: 'test/shots/v3-setup.png' });
  await B.type('#ainame', 'Bintang'); await B.click('#start');
  await B.waitForSelector('#wface', { timeout: 10000 });
  // A also gets setup screen after join
  await sleep(1500); await A.reload({ waitUntil: 'domcontentloaded' });
  try { await A.waitForSelector('#ainame', { timeout: 4000 }); await A.type('#ainame', 'Langit'); await A.click('#start'); } catch (e) { }
  await A.waitForSelector('#wface', { timeout: 10000 });
  await sleep(1200);
  await B.screenshot({ path: 'test/shots/v3-watch.png' });
  // watch: unlock -> grid -> open mood app -> set mood
  await B.click('#wface'); await sleep(400);
  await B.screenshot({ path: 'test/shots/v3-grid.png' });
  const icons = await B.$$('.wicon');
  console.log('icons:', icons.length);
  await icons[4].click(); await sleep(500); // mood app (5th)
  await B.screenshot({ path: 'test/shots/v3-wapp.png' });
  const wb = await B.$('#wback'); if (wb) await wb.click(); await sleep(300);
  // map
  await B.click('[data-t="map"]'); await sleep(1500);
  await B.screenshot({ path: 'test/shots/v3-map.png' });
  // sched
  await B.click('[data-t="sched"]'); await sleep(400);
  await B.evaluate(() => { document.querySelector('#st').value = 'Makan bareng'; });
  await B.click('#sadd'); await sleep(700);
  await B.screenshot({ path: 'test/shots/v3-sched.png' });
  // AI chat
  await B.click('[data-t="ai"]'); await sleep(500);
  await B.type('#cin', 'halo, lagi apa?');
  await B.evaluate(() => document.querySelector('#csend').click());
  await sleep(8000); await B.screenshot({ path: 'test/shots/v3-ai.png' });
  const lastMsg = await B.evaluate(() => [...document.querySelectorAll('#msgs .msg')].pop()?.textContent || 'NONE');
  console.log('AI:', lastMsg.slice(0, 90));
  // settings
  await B.click('#gear'); await sleep(500);
  await B.screenshot({ path: 'test/shots/v3-set.png' });
  // A sees partner mood/online
  await A.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
  await A.screenshot({ path: 'test/shots/v3-A.png' });
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
