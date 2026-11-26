const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const svg = 'file:///C:/Invest/public/icon.svg';
  for (const size of [192, 512]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.goto(svg);
    await new Promise(r => setTimeout(r, 300));
    const el = await page.$('svg');
    await el.screenshot({ path: `public/icon-${size}.png`, omitBackground: false });
    console.log('icon-' + size + '.png done');
  }
  await browser.close();
})();
