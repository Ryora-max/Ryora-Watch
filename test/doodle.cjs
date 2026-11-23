const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 120)));
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(B, { waitUntil: 'networkidle2' });
  await p.evaluate(async () => {
    const n = 'Dood' + Date.now() % 1e4;
    const a = await (await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) })).json();
    const b = await (await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n + 'B' }) })).json();
    const c = await (await fetch('/api/pair/create', { method: 'POST', headers: { 'x-token': a.token } })).json();
    await fetch('/api/pair/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': b.token }, body: JSON.stringify({ code: c.code }) });
    localStorage.cw_token = a.token; localStorage.cw_setup_done = '1';
  });
  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  // ke kangen, gambar di canvas
  await p.evaluate(() => document.querySelector('[data-t="miss"]').click());
  await new Promise(r => setTimeout(r, 800));
  const cv = await p.evaluate(() => {
    const c = document.querySelector('#doodle'); if (!c) return null;
    const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  console.log('canvas:', JSON.stringify(cv));
  // simulasi gambar garis
  await p.evaluate(() => {
    const c = document.querySelector('#doodle');
    const rect = c.getBoundingClientRect();
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
    ev('pointerdown', rect.x + 40, rect.y + 40);
    ev('pointermove', rect.x + 120, rect.y + 140);
    ev('pointermove', rect.x + 200, rect.y + 80);
    ev('pointerup', rect.x + 200, rect.y + 80);
  });
  await new Promise(r => setTimeout(r, 300));
  // cek ada stroke (pixel bukan bg)
  const drawn = await p.evaluate(() => {
    const c = document.querySelector('#doodle');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200) n++;
    return n;
  });
  console.log('white pixels drawn:', drawn);
  // kirim doodle
  await p.evaluate(() => document.querySelector('#doodSend').click());
  await new Promise(r => setTimeout(r, 1200));
  // cek muncul di kenangan home
  await p.evaluate(() => document.querySelector('[data-t="home"]').click());
  await new Promise(r => setTimeout(r, 2000));
  console.log('mem count:', await p.evaluate(() => document.querySelectorAll('#hmems .hphoto').length));
  // wrapped share — cek tombol ada + klik (download via CDP akan gagal headless, tapi render canvas jalan)
  await p.evaluate(() => document.querySelector('#gear').click());
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => document.querySelector('#wrapBtn').click());
  await new Promise(r => setTimeout(r, 1200));
  console.log('share btn:', await p.evaluate(() => !!document.querySelector('#wshare')));
  const png = await p.evaluate(() => { document.querySelector('#wshare').click(); return true; });
  console.log('share clicked:', png);
  await p.screenshot({ path: 'test/shots/doodle.png' });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
