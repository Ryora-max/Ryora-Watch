const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots/audit', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 180000 });
  const errs = [], fails = [];
  const j = r => r.json();
  const a = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Aya' }) }).then(j);
  const b2 = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bimo' }) }).then(j);
  const ta = { 'x-token': a.token, 'content-type': 'application/json' }, tb = { 'x-token': b2.token, 'content-type': 'application/json' };
  const pc = await fetch('http://localhost:3000/api/pair/create', { method: 'POST', headers: ta }).then(j);
  await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: tb, body: JSON.stringify({ code: pc.code }) });
  await fetch('http://localhost:3000/api/schedules', { method: 'POST', headers: ta, body: JSON.stringify({ title: 'Nonton bareng 🎬', start: Date.now() + 7200000, note: 'drakor ep 3' }) });
  await fetch('http://localhost:3000/api/schedules', { method: 'POST', headers: ta, body: JSON.stringify({ title: 'Makan siang', start: Date.now() + 100000000 }) });
  await fetch('http://localhost:3000/api/bucket', { method: 'POST', headers: ta, body: JSON.stringify({ text: 'Nonton aurora di Islandia' }) });
  await fetch('http://localhost:3000/api/bucket', { method: 'POST', headers: ta, body: JSON.stringify({ text: 'Masak bareng tiap minggu' }) });
  await fetch('http://localhost:3000/api/daily/answer', { method: 'POST', headers: ta, body: JSON.stringify({ text: 'Ketawa bareng pas salah masuk kelas wkwk' }) });
  await fetch('http://localhost:3000/api/daily/answer', { method: 'POST', headers: tb, body: JSON.stringify({ text: 'Kamu salah kirim stiker ke grup keluarga 😂' }) });
  await fetch('http://localhost:3000/api/status', { method: 'POST', headers: tb, body: JSON.stringify({ text: 'lagi sibuk 💼' }) });
  await fetch('http://localhost:3000/api/meet', { method: 'POST', headers: ta, body: JSON.stringify({ ts: Date.now() + 15 * 86400000 }) });

  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('requestfailed', r => fails.push(r.url().slice(0, 90)));
  await p.setViewport({ width: 390, height: 844 });
  await p.evaluateOnNewDocument(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, a.token);

  const shot = async (n, ms = 500) => { await sleep(ms); await p.screenshot({ path: `test/shots/audit/${n}.png` }); };

  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.home', { timeout: 15000 }); await shot('01-home-top', 900);
  await p.evaluate(() => { const h = document.querySelector('.home'); h.scrollTop = h.scrollHeight; }); await shot('02-home-bottom', 400);

  for (const [tab, name] of [['watch', '03-watch'], ['map', '04-map'], ['sched', '05-sched-list'], ['miss', '07-miss'], ['ai', '08-ai']]) {
    await p.click(`[data-t="${tab}"]`); await shot(name, 800);
  }
  // watch: unlock → launcher → apps
  await p.click('[data-t="watch"]'); await sleep(400);
  await p.click('.wscreen'); await shot('03b-watch-launcher', 600);
  for (const [i, n] of [[0, '03c-w-sched'], [1, '03d-w-map'], [2, '03e-w-ai'], [3, '03f-w-miss'], [4, '03g-w-mood'], [5, '03h-w-status']]) {
    await p.evaluate(idx => document.querySelectorAll('.wicon')[idx]?.click(), i); await shot(n, 500);
    await p.evaluate(() => document.querySelector('.wback')?.click()); await sleep(250);
  }
  // calendar view
  await p.click('[data-t="sched"]'); await sleep(300);
  await p.click('#segCal'); await shot('06-sched-cal', 500);
  // miss bottom
  await p.click('[data-t="miss"]'); await sleep(300);
  await p.evaluate(() => { const m = document.querySelector('.misspage'); m.scrollTop = m.scrollHeight; }); await shot('07b-miss-bottom', 400);
  // settings + ai profile + wallpaper
  await p.click('#gear'); await shot('09-settings', 500);
  await p.click('#aipSet'); await shot('10-ai-profile', 400);
  await p.click('#cls3'); await p.click('#gear'); await sleep(300);
  await p.click('#wpSet'); await shot('11-wallpaper', 400);

  console.log('errors:', errs.length ? errs.join(' | ') : 'NONE');
  console.log('failed req:', fails.length ? fails.join(' | ') : 'NONE');
  console.log('DONE'); await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1) });
