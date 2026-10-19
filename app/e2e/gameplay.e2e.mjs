// A few hands at a 4-player table with the coach on: hands complete, decision
// scores and coach reveals appear, and nothing errors.
import { BASE_URL, launchBrowser } from './env.mjs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE_URL);
await page.evaluate(() => localStorage.clear());
await page.goto(BASE_URL);
await page.click('text=▶ Start');
await page.locator('input[type="number"]').first().fill('4');
await page.locator('input[type="number"]').first().blur();
await page.locator('button[role="switch"]').nth(1).click(); // coach on
await page.click('text=♠ Start playing');
let hands = 0, scoreLines = 0, revealedOk = 0;
const seenHandNums = new Set();
for (let i = 0; i < 600 && hands < 6; i++) {
  const yourTurn = (await page.locator('text=● Your turn').count()) > 0;
  if (yourTurn) {
    // Use the coach panel like a real player sometimes does.
    const reveal = page.getByRole('button', { name: 'Reveal suggestion' });
    if (await reveal.count()) { await reveal.click().catch(() => {}); if (await page.locator('text=Suggests:').count()) revealedOk++; }
    const check = page.getByRole('button', { name: 'Check', exact: true });
    const call = page.getByRole('button', { name: /^Call \$/ });
    if (await check.count()) await check.click().catch(() => {});
    else if (await call.count()) await call.click().catch(() => {});
  }
  const result = await page.locator('text=Hand result').count();
  if (result) {
    const hn = await page.locator('span', { hasText: /^#\d+$/ }).first().innerText().catch(() => '?');
    if (!seenHandNums.has(hn)) {
      seenHandNums.add(hn);
      hands++;
      scoreLines += await page.locator('text=/Decision score \\d+\\/10/').count();
    }
    // With the coach on the next hand waits for you.
    await page.getByRole('button', { name: 'Next hand →' }).click().catch(() => {});
  }
  await page.waitForTimeout(250);
}
console.log(`hands completed: ${hands}, decision-score lines seen: ${scoreLines}, coach reveals: ${revealedOk}`);
console.log(`errors: ${errors.length}`, errors.slice(0, 3));
await browser.close();
process.exit(hands >= 4 && scoreLines > 0 && errors.length === 0 ? 0 : 1);
