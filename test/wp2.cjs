const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const ctx = await b.createBrowserContext(), A = await ctx.newPage();
  const ctxB = await b.createBrowserContext(), B = await ctxB.newPage();
  for (const p of [A, B]) { await p.setViewport({ width: 390, height: 844 }); p.on('pageerror', e => console.log('PAGEERR', e.message)); }
  await A.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#name'); await A.type('#name', 'Andi'); await A.click('#go'); await A.waitForSelector('#create');
  await A.click('#create'); await A.waitForSelector('.code');
  const code = await A.$eval('.code', e => e.textContent.trim());
  await B.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#name'); await B.type('#name', 'Bella'); await B.click('#go'); await B.waitForSelector('#code');
  await B.type('#code', code); await B.click('#join');
  await B.waitForSelector('#ainame', { timeout: 10000 }); // setup screen!
  await B.screenshot({ path: 'test/shots/s-setup.png' });
  await B.type('#ainame', 'Bintang'); await B.click('[data-g="cowo"]');
  await B.click('#start');
  await B.waitForSelector('.wscreen', { timeout: 10000 }); await sleep(800);
  await B.screenshot({ path: 'test/shots/s-face.png' });
  await B.evaluate(() => document.querySelector('#wface').click()); await sleep(400); // unlock → grid
  await B.screenshot({ path: 'test/shots/s-grid.png' });
  await B.evaluate(() => document.querySelectorAll('.wicon')[4].click()); await sleep(400); // Mood app
  await B.screenshot({ path: 'test/shots/s-mood.png' });
  await B.evaluate(() => document.querySelector('#wback').click()); await sleep(300);
  await B.evaluate(() => document.querySelectorAll('.wicon')[2].click()); await sleep(400); // AI app
  await B.screenshot({ path: 'test/shots/s-wai.png' });
  await B.click('[data-t="ai"]'); await sleep(400);
  await B.evaluate(() => document.querySelector('#aiprof').click()); await sleep(400); // profil bestie
  await B.screenshot({ path: 'test/shots/s-aiprof.png' });
  console.log('done');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
