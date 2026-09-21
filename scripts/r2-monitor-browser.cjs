const { chromium } = require('/tmp/r2-browser-check/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = process.env.R2_TEST_DIST || '/home/ubuntu/demo/SynthApi/web/default/dist';
  const data = JSON.parse(fs.readFileSync('/tmp/r2-monitor-snapshot.json'));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
      await page.addInitScript(() => localStorage.setItem('user', JSON.stringify({ id: 1, username: 'monitor-test', role: 100, status: 1 })));
      await page.route('https://admin.synthapi.asia/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/admin/r2-monitor') {
          await new Promise(resolve => setTimeout(resolve, 1500));
          return route.fulfill({ json: { success: true, data } });
        }
        if (url.pathname === '/api/setup') return route.fulfill({ json: { success: true, data: { status: true } } });
        if (url.pathname === '/api/notice') return route.fulfill({ json: { success: true, data: '' } });
        if (url.pathname === '/api/user/self') return route.fulfill({ json: { success: true, data: { id: 1, username: 'monitor-test', role: 100, status: 1 } } });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { success: true, data: {} } });
        if (process.env.R2_TEST_LIVE === '1') return route.continue();
        const asset = path.join(root, url.pathname);
        const file = fs.existsSync(asset) && fs.statSync(asset).isFile() ? asset : path.join(root, 'index.html');
        const ext = path.extname(file);
        return route.fulfill({ path: file, contentType: ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' })[ext] || 'application/octet-stream' });
      });
      await page.goto('https://admin.synthapi.asia/r2-monitor');
      await page.getByRole('heading', { name: 'R2 数据监控', exact: true }).waitFor();
      await page.getByRole('table').waitFor().catch(async error => { console.log(await page.locator('body').innerText()); console.log(errors); throw error; });
      await page.getByRole('combobox', { name: '数据类型' }).selectOption('records');
      await page.getByRole('button', { name: '查看', exact: true }).first().click();
      await page.screenshot({ path: `/tmp/r2-monitor-${width}.png`, fullPage: true });
      if (errors.length) throw new Error(errors.join('\n'));
      const overflow = await page.locator('main').last().evaluate(element => element.scrollWidth > element.clientWidth || element.getBoundingClientRect().right > innerWidth);
      if (overflow) throw new Error(`page overflow at ${width}`);
      console.log(`PASS ${width}: records, details, no page errors or overflow`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
