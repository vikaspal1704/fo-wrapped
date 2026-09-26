// Renders the Open Graph preview (1200×630) and app icons into public/.
// Dev-only; run after changing the brand: `npm run brand`.
// Set PW_CHROMIUM_PATH to use a local Chromium build.
import { chromium } from '@playwright/test';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)"/><path d="M7.5 21.5l6-7 4 4 7-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const OG = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;padding:80px 90px;display:flex;flex-direction:column;justify-content:space-between;
  background:radial-gradient(80% 70% at 100% 0%,#5a3fd6,transparent 65%),radial-gradient(60% 60% at 0% 100%,#2a1f66,transparent 70%),#0b0c10;
  color:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="display:flex;align-items:center;gap:24px">
    <div style="width:84px;height:84px">${ICON}</div>
    <div style="font-size:34px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b39dff">Your trading year, Wrapped</div>
  </div>
  <div>
    <div style="font-size:112px;font-weight:800;line-height:1">F&amp;O Wrapped</div>
    <div style="margin-top:28px;font-size:40px;color:#c9cdd6">Honest, shareable cards about your F&amp;O year.</div>
  </div>
  <div style="font-size:30px;color:#a4aab6">🔒 Runs in your browser. Nothing is uploaded. · Free &amp; open source</div>
</div></body></html>`;

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(OG);
await page.screenshot({ path: 'public/og.png' });

for (const [size, name, pad] of [
  [512, 'icon-512.png', 0],
  [192, 'icon-192.png', 0],
  [180, 'apple-touch-icon.png', 0],
  [512, 'icon-maskable-512.png', 56],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#0b0c10"><div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad}px">${ICON.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: `public/${name}`, omitBackground: pad === 0 });
}
await browser.close();
console.log('wrote public/og.png and icons');
