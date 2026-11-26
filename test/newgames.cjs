const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
const get = (p, t) => fetch(B + p, { headers: { 'x-token': t } }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'Sea' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const gal = await get('/api/gallery', ua.token);
  console.log('gallery:', JSON.stringify(gal).slice(0, 80));
  const mk = async (t) => {
    const br = await puppeteer.launch({ headless: 'new', userDataDir: 'C:/Invest/test/tmp/t' + Date.now() + Math.random() });
    const p = await br.newPage();
    await p.setViewport({ width: 390, height: 844, isMobile: true });
    p.on('pageerror', e => console.log('ERR', e.message.slice(0, 120)));
    await p.evaluateOnNewDocument(tt => { localStorage.cw_setup_done = '1'; localStorage.cw_token = tt; localStorage.cw_toured = '1'; }, t);
    await p.goto(B, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));
    await p.evaluate(() => document.querySelector('[data-t="miss"]').click());
    await new Promise(r => setTimeout(r, 800));
    return { br, p };
  };
  const A = await mk(ua.token), Bp = await mk(ub.token);
  // ⚡ adu cepat — A mulai, tunggu GO, B tap
  await A.p.evaluate(() => document.getElementById('tapBtn').click());
  await new Promise(r => setTimeout(r, 600));
  const tapA = await A.p.evaluate(() => document.getElementById('tapState').textContent);
  const tapB = await Bp.p.evaluate(() => document.getElementById('tapState').textContent);
  console.log('tap wait:', tapA, '|', tapB);
  // tunggu GO (1.2-4s)
  await new Promise(r => setTimeout(r, 4500));
  const goA = await A.p.evaluate(() => document.getElementById('tapState').textContent);
  console.log('tap go:', goA);
  await A.p.evaluate(() => document.getElementById('tapHit').click());
  await new Promise(r => setTimeout(r, 500));
  console.log('tap done A:', await A.p.evaluate(() => document.getElementById('tapState').textContent));
  console.log('tap done B:', await Bp.p.evaluate(() => document.getElementById('tapState').textContent));
  // 💞 dua hati — A mulai, dua2nya milih 'a'
  await A.p.evaluate(() => document.getElementById('matchBtn').click());
  await new Promise(r => setTimeout(r, 700));
  console.log('match q A:', await A.p.evaluate(() => document.getElementById('matchState').textContent));
  console.log('match q B:', await Bp.p.evaluate(() => document.getElementById('matchState').textContent));
  await A.p.evaluate(() => document.querySelector('#matchOpts [data-s="a"]').click());
  await Bp.p.evaluate(() => document.querySelector('#matchOpts [data-s="a"]').click());
  await new Promise(r => setTimeout(r, 700));
  console.log('match done A:', await A.p.evaluate(() => document.getElementById('matchState').textContent));
  await A.p.screenshot({ path: 'test/ng_main.png' });
  await A.br.close(); await Bp.br.close();
  console.log('done');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
