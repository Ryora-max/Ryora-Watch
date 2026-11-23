const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const mk = async () => {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 100)));
    await p.setViewport({ width: 390, height: 844 });
    return p;
  };
  const [pa, pb] = [await mk(), await mk()];
  const tok = async (p, n) => {
    await p.goto(B, { waitUntil: 'networkidle2' });
    return p.evaluate(async (name) => {
      const a = await (await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
      localStorage.cw_token = a.token; localStorage.cw_setup_done = '1';
      return a.token;
    }, n);
  };
  const ta = await tok(pa, 'Tod' + Date.now() % 1e4), tb = await tok(pb, 'TodB' + Date.now() % 1e4);
  const code = await pa.evaluate(async (t) => (await (await fetch('/api/pair/create', { method: 'POST', headers: { 'x-token': t } })).json()).code, ta);
  await pb.evaluate(async (t, c) => fetch('/api/pair/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': t }, body: JSON.stringify({ code: c }) }), tb, code);
  // isi mood buat tracker
  await pa.evaluate(async (t) => { const H = { 'content-type': 'application/json', 'x-token': t }; await fetch('/api/mood', { method: 'POST', headers: H, body: JSON.stringify({ mood: '😊' }) }); }, ta);
  await pb.evaluate(async (t) => { const H = { 'content-type': 'application/json', 'x-token': t }; await fetch('/api/mood', { method: 'POST', headers: H, body: JSON.stringify({ mood: '🥰' }) }); }, tb);
  await pa.reload({ waitUntil: 'networkidle2' });
  await pb.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  // mood week di home A
  await pa.evaluate(() => document.querySelector('[data-t="home"]').click());
  await new Promise(r => setTimeout(r, 1500));
  console.log('mood cells:', await pa.evaluate(() => [...document.querySelectorAll('.mwc')].map(c => c.textContent).join('')));
  // ToD: buka kangen dua-duanya, B request dare
  for (const p of [pa, pb]) await p.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 800));
  await pb.evaluate(() => document.querySelector('.tod[data-m="dare"]').click());
  await new Promise(r => setTimeout(r, 800));
  console.log('A sees:', await pa.evaluate(() => document.querySelector('#todState')?.innerText?.replace(/\n/g, ' | ')));
  console.log('B sees:', await pb.evaluate(() => document.querySelector('#todState')?.innerText?.replace(/\n/g, ' | ')));
  await pa.evaluate(() => document.querySelector('.tod[data-m="truth"]').click());
  await new Promise(r => setTimeout(r, 800));
  console.log('B sees2:', await pb.evaluate(() => document.querySelector('#todState')?.innerText?.replace(/\n/g, ' | ')));
  await pa.screenshot({ path: 'test/shots/tod.png' });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
