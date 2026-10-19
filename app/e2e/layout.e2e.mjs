// Laptops and phones: every screen fits the window — the page itself never scrolls;
// anything taller scrolls inside its own panel — and the button you need next
// (your actions, "Next hand", a drill's "Next") is always on screen.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const browser = await launchBrowser();
const errors = [];

for (const [w, h] of [
  [1366, 657], // the most common laptop, inside a browser window
  [1280, 640],
  [390, 844], // phones held upright
  [360, 740],
]) {
  const phone = w < 600;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => errors.push(e.message));
  const size = `${w}×${h}`;
  const fits = async (name) => {
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, vh: innerHeight }));
    check(`${size} ${name}: fits without page scrolling`, m.doc <= m.vh + 1, `${m.doc}px page in a ${m.vh}px window`);
  };
  const onScreen = async (locator) => {
    const box = await locator.boundingBox();
    return !!box && box.y >= 0 && box.y + box.height <= h + 1 && box.x >= 0 && box.x + box.width <= w + 1;
  };

  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE_URL);
  await page.click('text=▶ Start');
  await fits('quick game menu');
  // On a phone the form scrolls inside its panel; on a laptop it all fits.
  if (!phone) check(`${size} "Start playing" is on screen`, await onScreen(page.getByRole('button', { name: '♠ Start playing' })));
  await page.getByRole('button', { name: 'Scenario' }).click();
  await fits('scenarios');
  await page.getByRole('button', { name: '📊 Stats' }).click();
  await fits('stats');

  // Training: every drill, before and after answering.
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  const unfold = page.getByRole('button', { name: /▸ Your training path/ });
  if (await unfold.count()) await unfold.click(); // phones can fold the path away
  await page.locator('button', { hasText: 'Unlock all levels' }).click();
  for (const lvl of ['1. ', '2. ', '3. ', '4. ', '5. ']) {
    await page.locator('button', { hasText: lvl }).first().click();
    await page.waitForTimeout(150);
    await fits(`drill ${lvl.trim()}`);
    // Answer with the last short button in the drill pane (an answer choice).
    // The drill: everything after the level heading.
    const pane = phone ? page.locator('div.border-t.border-slate-800.pt-3').last() : page.locator('div.side\\:overflow-y-auto').nth(1);
    const btns = pane.locator('button:not([role="switch"])');
    for (let i = (await btns.count()) - 1; i >= 0; i--) {
      const t = (await btns.nth(i).innerText()).trim();
      if (/^(Next|How|Show|▸|▾)/.test(t) || t.length > 30) continue;
      await btns.nth(i).click();
      break;
    }
    const next = page.locator('[data-next]');
    if (await next.count()) {
      await fits(`drill ${lvl.trim()} answered`);
      check(`${size} drill ${lvl.trim()}: "Next" is on screen after answering`, await onScreen(next.first()));
    }
    if (lvl === '5. ') await page.screenshot({ path: `${SHOT}/layout-${w}-drill-answered.png` });
  }

  // The game, with the coach on.
  await page.getByRole('button', { name: 'Quick game', exact: true }).click();
  await page.locator('input[type="number"]').first().fill('6');
  await page.locator('input[type="number"]').first().blur();
  await page.locator('button[role="switch"]').nth(1).click();
  await page.getByRole('radio', { name: 'Fast' }).click();
  await page.click('text=♠ Start playing');
  for (let i = 0; i < 300 && !(await page.locator('text=● Your turn').count()); i++) await page.waitForTimeout(100);
  await fits('table, your turn');
  check(`${size} your action buttons are on screen`, await onScreen(page.getByRole('button', { name: 'Fold', exact: true })));
  const reveal = page.getByRole('button', { name: 'Reveal suggestion' });
  if (await reveal.count()) await reveal.click();
  const math = page.locator('text=Show the math');
  if (await math.count()) await math.first().click();
  await fits('table, coach and math open');
  check(`${size} action buttons stay on screen with the coach open`, await onScreen(page.getByRole('button', { name: 'Fold', exact: true })));
  await page.screenshot({ path: `${SHOT}/layout-${w}-table-coach.png` });
  await page.keyboard.press('f');
  for (let i = 0; i < 200 && !(await page.locator('text=Hand result').count()); i++) await page.waitForTimeout(100);
  await fits('table, hand result');
  check(`${size} "Next hand" is on screen`, await onScreen(page.getByRole('button', { name: 'Next hand →' })));
  await page.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
