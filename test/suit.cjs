const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 90000 });
  const mk = async () => {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 120)));
    await p.setViewport({ width: 390, height: 844 });
    return p;
  };
  const setup = async (p, name) => {
    await p.goto(B, { waitUntil: 'networkidle2' });
    await p.evaluate(async (n) => {
      const r = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) });
      const d = await r.json(); localStorage.cw_token = d.token; localStorage.cw_setup_done = '1';
    }, name);
    return p.evaluate(() => localStorage.cw_token);
  };
  const [pa, pb] = [await mk(), await mk()];
  const ta = await setup(pa, 'SuitA' + Date.now() % 1e4);
  const tb = await setup(pb, 'SuitB' + Date.now() % 1e4);
  const code = await pa.evaluate(async (t) => (await (await fetch('/api/pair/create', { method: 'POST', headers: { 'x-token': t } })).json()).code, ta);
  await pb.evaluate(async (t, c) => fetch('/api/pair/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': t }, body: JSON.stringify({ code: c }) }), tb, code);
  await pa.reload({ waitUntil: 'networkidle2' });
  await pb.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  // buka tab kangen dua-duanya
  for (const p of [pa, pb]) await p.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 800));
  // A pilih ✊
  await pa.evaluate(() => document.querySelector('.suit[data-h="✊"]').click());
  await new Promise(r => setTimeout(r, 600));
  console.log('B invite text:', await pb.evaluate(() => document.querySelector('#suitState')?.textContent));
  // B pilih ✌️
  await pb.evaluate(() => document.querySelector('.suit[data-h="✌️"]').click());
  await new Promise(r => setTimeout(r, 1000));
  console.log('A result:', await pa.evaluate(() => document.querySelector('#suitState')?.textContent));
  console.log('B result:', await pb.evaluate(() => document.querySelector('#suitState')?.textContent));
  // home feed + weather chip
  await pa.evaluate(() => document.querySelector('[data-t="home"]').click());
  await new Promise(r => setTimeout(r, 1500));
  console.log('feed rows:', await pa.evaluate(() => document.querySelectorAll('.feedrow').length));
  console.log('wx chip:', await pa.evaluate(() => document.querySelector('#hWx')?.textContent));
  await pa.screenshot({ path: 'test/shots/feed.png' });
  await pb.screenshot({ path: 'test/shots/suit.png' });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
