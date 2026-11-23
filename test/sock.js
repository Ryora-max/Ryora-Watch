// Focused socket test: 2 user → pair → miss A→B, B→A
import puppeteer from 'puppeteer';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ctx(browser, name) {
  const c = await browser.createBrowserContext();
  await c.overridePermissions(BASE, ['geolocation', 'notifications']);
  const p = await c.newPage();
  p.on('console', m => console.log(`[${name}]`, m.text().slice(0, 120)));
  p.on('pageerror', e => console.log(`[${name}] PAGEERROR:`, e.message));
  return p;
}

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], userDataDir: `test/.chrome-${Date.now()}` });
const A = await ctx(b, 'A'), B = await ctx(b, 'B');
await A.goto(BASE); await B.goto(BASE);
for (const [p, n] of [[A, 'Andi'], [B, 'Bella']]) { await p.type('#name', n); await p.click('#go'); await sleep(600); }
await A.click('#create');
await A.waitForSelector('.code', { timeout: 8000 });
const code = await A.$eval('.code', e => e.textContent);
console.log('code:', code);
await B.type('#code', code); await B.click('#join'); await sleep(1200);
await A.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

// cek status socket kedua sisi
for (const [p, n] of [[A, 'A'], [B, 'B']]) {
  const st = await p.evaluate(() => ({ conn: socket?.connected, id: socket?.id }));
  console.log(`${n} socket:`, JSON.stringify(st));
}

console.log('--- B kirim miss ---');
await B.evaluate(() => socket.emit('miss:send', { pattern: 2 }));
await sleep(1200);
console.log('A missText:', JSON.stringify(await A.$eval('#missText', e => e.textContent)));

console.log('--- A kirim miss ---');
await A.evaluate(() => socket.emit('miss:send', { pattern: 3 }));
await sleep(1200);
console.log('B missText:', JSON.stringify(await B.$eval('#missText', e => e.textContent)));
await b.close();
