const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'Sky' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  await post('/api/expense', { kind: 'in', amount: 500000, note: 'uang saku' }, ua.token);
  await post('/api/expense', { kind: 'out', amount: 75000, note: 'makan siang' }, ub.token);
  await post('/api/goal', { name: 'date ke bandung', amount: 1000000 }, ua.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/pr_' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  for (const t of ['home','uang','miss','kita']) {
    await page.evaluate(tb => document.querySelector(`[data-t="${tb}"]`)?.click(), t);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `test/rev_${t}.png` });
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
