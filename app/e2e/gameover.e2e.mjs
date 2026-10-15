// Plays a short-stack heads-up scenario to the end (going all in every hand):
// the game-over screen must show the session report and "Play again" must
// return to the main menu.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE_URL);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('texas-holdem-coach:pref:bot-speed:v1', '"fast"'); });
await page.goto(BASE_URL);
await page.click('text=▶ Start');
await page.click('text=Scenario');
await page.click('text=Short-stack heads-up');
await page.click('text=♠ Got it — deal me in');
let ended = false;
for (let i = 0; i < 1500 && !ended; i++) {
  if ((await page.locator('text=Champion!').count()) || (await page.locator('text=Game over').count())) { ended = true; break; }
  if (await page.locator('text=● Your turn').count()) await page.keyboard.press('a');
  const next = page.getByRole('button', { name: 'Next hand →' });
  if (await next.count()) await next.click().catch(() => {});
  await page.waitForTimeout(120);

}
console.log('game ended:', ended);
const hasReport = (await page.locator('text=Session report').count()) > 0;
const playAgain = (await page.getByRole('button', { name: '♠ Play again' }).count()) > 0;
console.log('report on end screen:', hasReport, ' play again button:', playAgain);
await page.screenshot({ path: `${SHOT}/r3-gameover.png`, fullPage: true });
if (playAgain) { await page.getByRole('button', { name: '♠ Play again' }).click(); await page.waitForTimeout(300); }
console.log('back at menu:', (await page.locator('text=▶ Start').count()) > 0, (await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | '));
console.log('errors:', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(ended && hasReport && playAgain && errors.length === 0 ? 0 : 1);
