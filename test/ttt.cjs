const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'XA' + Date.now() % 999 });
  const ub = await post('/api/register', { name: 'XB' + Date.now() % 999 });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/ppt' + Date.now() });
  const mk = async (t) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844, isMobile: true });
    p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.evaluateOnNewDocument((tk) => { localStorage.cw_setup_done = '1'; localStorage.cw_token = tk; localStorage.cw_toured = '1'; }, t);
    await p.goto(B, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3500));
    return p;
  };
  const A = await mk(ua.token), Bp = await mk(ub.token);
  // A buka kangen → ajak main
  await A.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 1200));
  await A.evaluate(() => document.querySelector('#tttBtn').click());
  await new Promise(r => setTimeout(r, 1500));
  // B dapat prompt → Gas!
  const got = await Bp.evaluate(() => !!document.querySelector('#ttA'));
  console.log('B dapat undangan:', got);
  await Bp.evaluate(() => document.querySelector('#ttA')?.click());
  await new Promise(r => setTimeout(r, 1500));
  // A (x) main sel 0, B (o) main sel 4, A sel 1, B sel 8, A sel 2 → A menang baris atas
  for (const [p, cell] of [[A, 0], [Bp, 4], [A, 1], [Bp, 8], [A, 2]]) {
    await p.evaluate(c => { const b = document.querySelector(`.tttc[data-i="${c}"]`); b && b.click(); }, cell);
    await new Promise(r => setTimeout(r, 700));
  }
  const stA = await A.evaluate(() => document.querySelector('#tttState')?.textContent);
  const stB = await Bp.evaluate(() => document.querySelector('#tttState')?.textContent);
  const board = await A.evaluate(() => [...document.querySelectorAll('.tttc')].map(x => x.textContent).join('|'));
  console.log('state A:', stA, '| state B:', stB, '| board:', board);
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
