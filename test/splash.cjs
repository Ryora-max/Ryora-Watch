const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/ps_' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'test/shot_splash.png' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'test/shot_after.png' });
  console.log('errors:', errs.length, errs.slice(0, 3).join(' | '));
  const sp = await page.evaluate(() => !!document.querySelector('#splash'));
  console.log('splash still there after 3s:', sp);
  await browser.close();
})();
