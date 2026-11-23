const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.screenshot({ path: 'test/shots/d-auth.png' });
  await p.type('#name', 'Desk' + Date.now() % 9999); await p.click('#go');
  await p.waitForSelector('#create'); await p.screenshot({ path: 'test/shots/d-pair.png' });
  await b.close(); console.log('done');
})().catch(e => console.log('ERR', e.message));
