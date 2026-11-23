const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new' });
  const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) { await p.setViewport({ width: 390, height: 844 }); p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 120)); }); }
  const suf = Date.now() % 10000;
  await A.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#name'); await A.type('#name', 'Rama' + suf); await A.click('#go');
  await A.waitForSelector('#create'); await A.click('#create');
  await A.waitForSelector('.code'); const code = await A.$eval('.code', e => e.textContent.trim());
  await B.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#name'); await B.type('#name', 'Sari' + suf); await B.click('#go');
  await B.waitForSelector('#code'); await B.type('#code', code); await B.click('#join');
  await B.waitForSelector('#skip'); await B.click('#skip');
  await B.waitForSelector('.home', { timeout: 10000 });
  await sleep(1000);
  await B.screenshot({ path: 'test/shots/h-home.png' });
  // answer daily question
  const hasAns = await B.$('#hans');
  if (hasAns) { await B.type('#hans', 'ke pantai lihat sunset'); await B.click('#hansBtn'); await sleep(700); }
  // write note
  await B.evaluate(() => { document.querySelector('#hnote').value = 'semangat kerjanya ya 💪'; });
  await B.click('#hnoteBtn'); await sleep(500);
  await B.screenshot({ path: 'test/shots/h-home2.png' });
  // A side sees note + answer reveal after answering
  await A.waitForSelector('#ainame', { timeout: 15000 }); await A.type('#ainame', 'Ombak'); await A.click('#start');
  await A.waitForSelector('.home', { timeout: 10000 }); await sleep(1200);
  await A.screenshot({ path: 'test/shots/h-Ahome.png' });
  const hasA = await A.$('#hans');
  if (hasA) { await A.type('#hans', 'di rumah aja sama kamu'); await A.click('#hansBtn'); await sleep(700); }
  await A.screenshot({ path: 'test/shots/h-Ahome2.png' });
  // B should get home:changed update automatically
  await sleep(1500); await B.screenshot({ path: 'test/shots/h-home3.png' });
  // nav check
  const nav = await B.$$eval('nav button', bs => bs.map(x => x.textContent));
  console.log('nav:', nav.join(' | '));
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
