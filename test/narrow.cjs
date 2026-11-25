const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'Sky' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/pn_' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 700, isMobile: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3500));
  for (const [t, f] of [['home','n_home'],['kita','n_kita'],['miss','n_miss']]) {
    if (t !== 'home') await page.evaluate(tb => document.querySelector(`[data-t="${tb}"]`)?.click(), t);
    await new Promise(r => setTimeout(r, 1800));
    await page.screenshot({ path: `test/${f}.png` });
    // cek overflow horizontal
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    console.log(t, 'overflow-x:', ov);
  }
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
