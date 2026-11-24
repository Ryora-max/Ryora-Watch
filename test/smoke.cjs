const puppeteer = require('puppeteer');
(async () => {
  const B = 'http://localhost:3000';
  const ua = await fetch(B + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'SmkA' + Date.now() % 9999 }) }).then(r => r.json());
  const ub = await fetch(B + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'SmkB' + Date.now() % 9999 }) }).then(r => r.json());
  const pc = await fetch(B + '/api/pair/create', { method: 'POST', headers: { 'x-token': ua.token, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
  await fetch(B + '/api/pair/join', { method: 'POST', headers: { 'x-token': ub.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pc.code }) });
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 120)); });
  await page.evaluateOnNewDocument((t) => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_tour = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  for (const t of ['map', 'sched', 'miss', 'ai', 'kita']) {
    await page.evaluate(tb => document.querySelector(`[data-t="${tb}"]`)?.click(), t);
    await new Promise(r => setTimeout(r, 1800));
    console.log(t + ':', await page.evaluate(() => document.querySelector('#view').textContent.length) + ' chars');
  }
  await page.evaluate(() => document.querySelector('[data-t="home"]')?.click());
  await new Promise(r => setTimeout(r, 2500));
  const home = await page.evaluate(() => document.querySelector('#view .home')?.innerText.slice(0, 300));
  console.log('HOME:', JSON.stringify(home?.slice(0, 200)));
  console.log('ERRORS:', errors.length ? errors.slice(0, 8) : 'none');
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
