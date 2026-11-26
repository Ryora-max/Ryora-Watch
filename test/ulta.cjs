const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'Sky' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/pu_' + Date.now() });
  const mk = async (tok, name) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844, isMobile: true });
    await p.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, tok);
    p.on('pageerror', e => console.log(name + ' ERR', e.message.slice(0, 100)));
    await p.goto(B, { waitUntil: 'domcontentloaded' });
    return p;
  };
  const A = await mk(ua.token, 'A'), Bp = await mk(ub.token, 'B');
  await new Promise(r => setTimeout(r, 4500));
  // A buka tab Main + klik ular tangga
  await A.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 1200));
  await A.evaluate(() => document.querySelector('#ultaBtn').click());
  await new Promise(r => setTimeout(r, 1500));
  const aHas = await A.evaluate(() => !!document.querySelector('.ultamodal'));
  const bHas = await Bp.evaluate(() => !!document.querySelector('.ultamodal'));
  console.log('modal A:', aHas, '| modal B:', bHas);
  // A kocok (giliran dia)
  await A.evaluate(() => document.querySelector('#ulRoll').click());
  await new Promise(r => setTimeout(r, 1000));
  const st = await A.evaluate(() => ({ dice: document.querySelector('#ulDice').textContent, msg: document.querySelector('#ulMsg').textContent }));
  const stB = await Bp.evaluate(() => ({ dice: document.querySelector('#ulDice')?.textContent, msg: document.querySelector('#ulMsg')?.textContent }));
  console.log('A:', JSON.stringify(st));
  console.log('B:', JSON.stringify(stB));
  // B coba kocok — harus disabled (bukan gilirannya)
  const bDis = await Bp.evaluate(() => document.querySelector('#ulRoll').disabled);
  console.log('B roll disabled:', bDis);
  await A.screenshot({ path: 'test/ulta_a.png' });
  await Bp.screenshot({ path: 'test/ulta_b.png' });
  await browser.close();
  console.log('done');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
