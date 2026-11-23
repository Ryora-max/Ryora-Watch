const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const j = r => r.json();
  const a = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CA' }) }).then(j);
  const b2 = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CB' }) }).then(j);
  const ta = { 'x-token': a.token, 'content-type': 'application/json' }, tb = { 'x-token': b2.token, 'content-type': 'application/json' };
  const pc = await fetch('http://localhost:3000/api/pair/create', { method: 'POST', headers: ta }).then(j);
  await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: tb, body: JSON.stringify({ code: pc.code }) });
  await fetch('http://localhost:3000/api/schedules', { method: 'POST', headers: ta, body: JSON.stringify({ title: 'Nonton bareng', start: Date.now() + 7200000 }) });
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.evaluateOnNewDocument(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, a.token);
  for (const [w, h, tag] of [[390, 844, 'm390'], [768, 1024, 't768'], [1280, 800, 'd1280']]) {
    await p.setViewport({ width: w, height: h });
    await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.home', { timeout: 15000 }); await sleep(800);
    await p.screenshot({ path: `test/shots/c-${tag}-home.png` });
    await p.click('[data-t="sched"]'); await sleep(500);
    await p.screenshot({ path: `test/shots/c-${tag}-sched.png` });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(tag, 'overflow-x:', ov);
  }
  console.log('DONE'); await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1) });
