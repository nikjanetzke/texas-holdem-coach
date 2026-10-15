// Stall detector: heads-up, the human only ever checks or calls, so the bot
// often checks to close a street and then acts first on the next one.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.setDefaultTimeout(4000);
await page.goto(BASE_URL);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('texas-holdem-coach:pref:bot-speed:v1', '"fast"'); });
await page.goto(BASE_URL);
await page.click('text=▶ Start');
await page.locator('input[type="number"]').first().fill('2');
await page.locator('input[type="number"]').first().blur();
await page.click('text=♠ Start playing');
const sig = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').replace(/\d+:\d\d/, '').slice(0, 400);
let last = await sig(), lastChange = Date.now(), stalls = 0, hands = new Set();
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  if (await page.locator('text=● Your turn').count()) {
    const check = page.getByRole('button', { name: 'Check', exact: true });
    if (await check.count()) await check.click().catch(() => {});
    else await page.getByRole('button', { name: /^Call \$/ }).click().catch(() => {});
  }
  const next = page.getByRole('button', { name: 'Next hand →' });
  if (await next.count()) await next.click().catch(() => {});
  const hn = await page.locator('span', { hasText: /^#\d+$/ }).first().innerText().catch(() => '');
  hands.add(hn);
  const now = await sig();
  if (now !== last) { last = now; lastChange = Date.now(); }
  if (Date.now() - lastChange > 12000) {
    stalls++;
    console.log(`STALL on ${hn}: nothing changed for 12s`);
    await page.screenshot({ path: `${SHOT}/freeze-proof.png` });
    break;
  }
  await page.waitForTimeout(150);
}
console.log(`hands seen: ${hands.size}, stalls: ${stalls}`);
await browser.close();
process.exit(stalls ? 1 : 0);
