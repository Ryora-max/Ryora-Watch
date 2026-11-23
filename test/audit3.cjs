const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots/audit3', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const errs = [];
  const j = r => r.json();
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 390, height: 844 });
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#name', { timeout: 15000 }); await sleep(600);
  await p.screenshot({ path: 'test/shots/audit3/01-auth.png' });
  // register -> pair screen
  await p.type('#name', 'AuditA');
  await p.click('button.primary, #start, .card button');
  await sleep(1500);
  await p.screenshot({ path: 'test/shots/audit3/02-pair.png' });
  // create code -> waiting
  const btn = await p.$('#mkcode, button.ghost, .card button');
  try { await p.click('button'); await sleep(1200); } catch {}
  await p.screenshot({ path: 'test/shots/audit3/03-pair-wait.png' });
  console.log('errs:', errs.length ? errs.join('|') : 'NONE');
  console.log('DONE'); await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1) });
