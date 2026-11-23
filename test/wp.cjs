const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const ctx = await b.createBrowserContext(), A = await ctx.newPage();
  const ctxB = await b.createBrowserContext(), B = await ctxB.newPage();
  for (const p of [A, B]) await p.setViewport({ width: 390, height: 844 });
  await A.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await A.type('#name', 'Andi'); await A.click('#go'); await A.waitForSelector('#create');
  await A.click('#create'); await A.waitForSelector('.code');
  const code = await A.$eval('.code', e => e.textContent.trim());
  await B.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await B.type('#name', 'Bella'); await B.click('#go'); await B.waitForSelector('#code');
  await B.type('#code', code); await B.click('#join');
  await B.waitForSelector('.wscreen', { timeout: 12000 }); await sleep(1200);
  await B.screenshot({ path: 'test/shots/wp-face.png' });
  await B.click('#gear'); await sleep(500);
  await B.screenshot({ path: 'test/shots/wp-settings.png' });
  await B.evaluate(() => document.querySelectorAll('.wpswatch')[3].click()); // Senja
  await sleep(400); await B.click('#cls'); await sleep(500);
  await B.screenshot({ path: 'test/shots/wp-senja.png' });
  console.log('done');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
