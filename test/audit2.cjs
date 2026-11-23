const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 150)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 150)); });
  p.on('requestfailed', r => errs.push('REQFAIL ' + r.url().slice(0, 80)));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP' + r.status() + ' ' + r.url().slice(0, 80)); });
  await p.setViewport({ width: 390, height: 844 });
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#name');
  await p.type('#name', 'Solo' + Date.now() % 9999); await p.click('#go');
  await p.waitForSelector('#create'); await p.click('#create');
  await p.waitForSelector('.code');
  console.log('waiting screen ok');
  await p.screenshot({ path: 'test/shots/b-wait.png' });
  // solo user has no partner -> stays waiting. Use API to simulate: create second user join via fetch
  const code = await p.$eval('.code', e => e.textContent.trim());
  const tok2 = await (await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Partner' + Date.now() % 9999 }) })).json();
  const joined = await (await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': tok2.token }, body: JSON.stringify({ code }) })).json();
  console.log('joined:', JSON.stringify(joined));
  // waiting screen should auto-advance via poll (3s)
  await p.waitForSelector('#ainame', { timeout: 10000 });
  console.log('AUTO-ADVANCED to setup ✓');
  await p.type('#ainame', 'Bintang'); await p.click('#start');
  await p.waitForSelector('#wface');
  await sleep(1200);
  await p.screenshot({ path: 'test/shots/b-watch.png' });
  // watch apps
  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => document.querySelector('#wface')?.click());
    await sleep(250);
    const icons = await p.$$('.wicon');
    if (!icons[i]) continue;
    await icons[i].click(); await sleep(600);
    await p.screenshot({ path: `test/shots/b-wapp${i}.png` });
    await p.evaluate(() => document.querySelector('#wback')?.click()); await sleep(250);
  }
  await p.evaluate(() => document.querySelector('#wface')?.click()); await sleep(300);
  // wallpaper open
  await p.evaluate(() => document.querySelector('#wpaperBtn')?.click()); await sleep(400);
  await p.screenshot({ path: 'test/shots/b-wpaper.png' });
  await p.evaluate(() => document.querySelector('#cls4')?.click()); await sleep(200);
  // tabs
  for (const t of ['map', 'sched', 'miss', 'ai']) {
    await p.click(`[data-t="${t}"]`); await sleep(900);
    await p.screenshot({ path: `test/shots/b-${t}.png` });
  }
  // settings
  await p.evaluate(() => document.querySelector('#gear').click()); await sleep(400);
  await p.screenshot({ path: 'test/shots/b-set.png' });
  // overflow check all tabs
  for (const t of ['watch', 'map', 'sched', 'miss', 'ai']) {
    await p.evaluate(t2 => document.querySelector(`[data-t="${t2}"]`).click(), t); await sleep(500);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (ov) errs.push('OVERFLOW ' + t);
  }
  console.log('errors:', errs.length); errs.forEach(e => console.log(' -', e));
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
