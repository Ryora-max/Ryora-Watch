const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.setViewport({ width: 390, height: 844 });
  const j = r => r.json();
  const a = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'RX' }) }).then(j);
  const b2 = await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'RY' }) }).then(j);
  const ta = { 'x-token': a.token, 'content-type': 'application/json' }, tb = { 'x-token': b2.token, 'content-type': 'application/json' };
  const pc = await fetch('http://localhost:3000/api/pair/create', { method: 'POST', headers: ta }).then(j);
  await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: tb, body: JSON.stringify({ code: pc.code }) });
  await fetch('http://localhost:3000/api/daily/answer', { method: 'POST', headers: ta, body: JSON.stringify({ text: 'pantai wkwk' }) });
  await fetch('http://localhost:3000/api/daily/answer', { method: 'POST', headers: tb, body: JSON.stringify({ text: 'ketawa bareng' }) });
  const day = new Date().toISOString().slice(0, 10);
  await fetch('http://localhost:3000/api/react', { method: 'POST', headers: ta, body: JSON.stringify({ type: 'answer', tid: day, emoji: '❤️' }) });
  await p.evaluateOnNewDocument(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, b2.token);
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.home', { timeout: 15000 }); await sleep(900);
  const hasReact = await p.evaluate(() => !!document.querySelector('.hreact'));
  console.log('react row present:', hasReact);
  await p.evaluate(() => document.querySelector('.hreact').scrollIntoView());
  await p.screenshot({ path: 'test/shots/n3-react.png' });
  const btn = await p.$('.hreact button[data-e="😂"]');
  if (btn) { await btn.click(); await sleep(700); await p.screenshot({ path: 'test/shots/n3-react2.png' }); console.log('react clicked'); }
  console.log('DONE'); await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1) });
