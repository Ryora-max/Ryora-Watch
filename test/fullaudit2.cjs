const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
const get = (p, t) => fetch(B + p, { headers: { 'x-token': t } }).then(r => r.json());
(async () => {
  // ==== API AUDIT ====
  const ua = await post('/api/register', { name: 'Sea' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const apis = ['/api/home', '/api/gallery', '/api/expenses', '/api/garden', '/api/league', '/api/wrapped', '/api/memories', '/api/pins', '/api/voices', '/api/letters', '/api/capsules', '/api/schedules', '/api/habits', '/api/ai/history', '/api/miss/stats', '/api/suit/stats', '/api/partner/location'];
  for (const a of apis) {
    const r = await fetch(B + a, { headers: { 'x-token': ua.token } });
    const t = await r.text();
    const ok = r.status === 200 && t.startsWith('{') || t.startsWith('[');
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + a + ' → ' + r.status);
  }
  const exp = await get('/api/export', ua.token);
  console.log('export keys:', Object.keys(exp).join(','));
  // ==== UI AUDIT — console + network ====
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: 'C:/Invest/test/tmp/fa' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const errs = [], badNet = [];
  page.on('pageerror', e => errs.push('JS: ' + e.message.slice(0, 130)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 110)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) badNet.push(r.status() + ' ' + r.url().replace(B, '').slice(0, 60)); });
  await page.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));
  for (const t of ['home', 'map', 'sched', 'uang', 'miss', 'ai', 'kita']) {
    await page.evaluate(tt => document.querySelector(`[data-t="${tt}"]`)?.click(), t);
    await new Promise(r => setTimeout(r, 1100));
    await page.screenshot({ path: `test/au_${t}.png` });
  }
  // horizontal overflow check tiap tab
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth ? document.documentElement.scrollWidth : 0);
  console.log('hoverflow:', over || 'none');
  console.log('JS ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
  console.log('BAD NET:', badNet.length ? '\n' + badNet.join('\n') : 'none');
  await browser.close();
  console.log('done');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
