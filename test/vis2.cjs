const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new' });
  const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) { await p.setViewport({ width: 390, height: 844 }); p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,120)); }); }
  await A.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await A.type("#name", "Andi"); await A.click('#go'); await A.waitForSelector('#create');
  await A.click('#create'); try { await A.waitForSelector('.code', { timeout: 8000 }); } catch(e) { await A.screenshot({ path: 'test/shots/n-afail.png' }); console.log('A body:', await A.evaluate(() => document.body.innerText.slice(0,300))); throw e; }
  const code = await A.$eval('.code', e => e.textContent.trim()); console.log('CODE:', code);
  await B.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await B.type('#name', 'Bella'); await B.click('#go'); await B.waitForSelector('#code');
  await B.type('#code', code.replace('-', '')); await B.click('#join');
  try { await B.waitForSelector(".wscreen", { timeout: 12000 }); } catch(e) { await B.screenshot({ path: "test/shots/n-fail.png" }); console.log("B fail, body:", await B.evaluate(() => document.body.innerText.slice(0,300))); throw e; } await sleep(1500);
  await A.screenshot({ path: 'test/shots/n-auth.png' }).catch(()=>{});
  await B.screenshot({ path: 'test/shots/n-watch.png' });
  await B.click('[data-t="sched"]'); await sleep(400); await B.screenshot({ path: 'test/shots/n-sched.png' });
  await B.click('[data-t="ai"]'); await sleep(400);
  await B.type('#cin', 'halo, lagi apa?');
  await B.evaluate(() => document.querySelector('#csend').click());
  await sleep(9000); await B.screenshot({ path: 'test/shots/n-ai.png' });
  await B.click('#gear'); await sleep(500); await B.screenshot({ path: 'test/shots/n-set.png' });
  console.log("done");
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
