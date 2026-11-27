const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'Sea' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: 'C:/Invest/test/tmp/q' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 900));
  // scroll ke acak bareng + kirim sesuatu
  await page.evaluate(() => { const els = [...document.querySelectorAll('.msect')]; const t = els.find(e => e.textContent.includes('Acak')); t?.scrollIntoView({ block: 'start' }); });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'test/coin.png' });
  // klik koin → hasil overlay
  await page.evaluate(() => document.querySelector('.coinflip').click());
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'test/coin2.png' });
  await browser.close();
  console.log('done');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
