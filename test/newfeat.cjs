const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const mk = async () => (await b.createBrowserContext()).newPage();
  const t1 = await (await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'N1' + Date.now() % 9999 }) })).json();
  const t2 = await (await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'N2' + Date.now() % 9999 }) })).json();
  const code = (await (await fetch('http://localhost:3000/api/pair/create', { method: 'POST', headers: { 'x-token': t1.token } })).json()).code;
  await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: { 'x-token': t2.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  // seed: meet date, memory, status
  await fetch('http://localhost:3000/api/meet', { method: 'POST', headers: { 'x-token': t1.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ts: Date.now() + 15 * 86400000 }) });
  await fetch('http://localhost:3000/api/status', { method: 'POST', headers: { 'x-token': t1.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'lagi sibuk 💼' }) });
  const c = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f4a"/></svg>`;
  const img = 'data:image/svg+xml;base64,' + Buffer.from(c).toString('base64');
  await fetch('http://localhost:3000/api/memory', { method: 'POST', headers: { 'x-token': t1.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ img: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', caption: 'tes' }) });

  const pa = await mk(), pb = await mk();
  for (const [pg, tok] of [[pa, t1.token], [pb, t2.token]]) {
    pg.on('pageerror', e => console.log('PAGEERR', e.message));
    await pg.setViewport({ width: 390, height: 844 });
    await pg.evaluateOnNewDocument(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, tok);
    await pg.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('.home', { timeout: 15000 });
  }
  await sleep(1000);
  // Home B: countdown + memory + status A terlihat
  const homeTxt = await pb.evaluate(() => document.querySelector('.home')?.innerText || '');
  console.log('B home has meet:', /hari lagi|KETEMUAN/.test(homeTxt));
  console.log('B home status A:', homeTxt.includes('lagi sibuk'));
  await pb.screenshot({ path: 'test/shots/n-home.png' });
  // Miss tab: A care ping → B toast; A+B touch → match
  await pa.click('[data-t="miss"]'); await pb.click('[data-t="miss"]');
  await sleep(600);
  await pa.screenshot({ path: 'test/shots/n-miss.png' });
  await pa.click('.care[data-k="peluk"]'); await sleep(800);
  const toastB = await pb.evaluate(() => document.querySelector('.toast')?.textContent || '');
  console.log('B toast after care:', toastB.slice(0, 60));
  // touch match
  await pa.evaluate(() => document.querySelector('#touchBtn').dispatchEvent(new PointerEvent('pointerdown')));
  await sleep(300);
  await pb.evaluate(() => document.querySelector('#touchBtn').dispatchEvent(new PointerEvent('pointerdown')));
  await sleep(800);
  const stA = await pa.evaluate(() => document.querySelector('#touchState')?.textContent || '');
  const stB = await pb.evaluate(() => document.querySelector('#touchState')?.textContent || '');
  console.log('touch A:', stA, '| B:', stB);
  await pb.screenshot({ path: 'test/shots/n-miss-match.png' });
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
