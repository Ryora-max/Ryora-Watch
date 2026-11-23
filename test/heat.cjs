const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 100)));
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(B, { waitUntil: 'networkidle2' });
  const token = await p.evaluate(async () => {
    const n = 'Heat' + Date.now() % 1e4;
    const a = await (await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) })).json();
    const b = await (await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n + 'B' }) })).json();
    const c = await (await fetch('/api/pair/create', { method: 'POST', headers: { 'x-token': a.token } })).json();
    await fetch('/api/pair/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': b.token }, body: JSON.stringify({ code: c.code }) });
    // isi aktivitas biar heatmap + feed ke-render
    const H = { 'content-type': 'application/json', 'x-token': a.token };
    await fetch('/api/note', { method: 'POST', headers: H, body: JSON.stringify({ text: 'sayangku ❤️' }) });
    await fetch('/api/daily/answer', { method: 'POST', headers: H, body: JSON.stringify({ text: 'pantai!' }) });
    await fetch('/api/bucket', { method: 'POST', headers: H, body: JSON.stringify({ text: 'kemah bareng' }) });
    return a.token;
  });
  await p.evaluate(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, token);
  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  console.log('feed rows:', await p.evaluate(() => document.querySelectorAll('.feedrow').length));
  await p.screenshot({ path: 'test/shots/homefeed.png' });
  // buka wrapped via settings gear
  await p.evaluate(() => document.querySelector('#gear').click());
  await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => document.querySelector('#wrapBtn').click());
  await new Promise(r => setTimeout(r, 1500));
  console.log('heat cells:', await p.evaluate(() => document.querySelectorAll('.hmap i').length));
  await p.screenshot({ path: 'test/shots/wrapped_heat.png' });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
