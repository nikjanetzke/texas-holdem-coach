// Progress across sessions, plain-English leaks, and the coach explaining what
// it assumes opponents hold. Run with vite-node (see run.mjs).
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
import { LEAK_TEXT } from '../src/coach/coach';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Ignored invalid') && errors.push(m.text()));
const yourTurn = () => page.locator('text=● Your turn').count();
const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('texas-holdem-coach:progress:v1') || '[]'));

async function startGame() {
  await page.goto(BASE_URL);
  await page.click('text=▶ Start');
  await page.locator('input[type="number"]').first().fill('3');
  await page.locator('input[type="number"]').first().blur();
  await page.locator('button[role="switch"]').nth(1).click(); // coach on
  await page.getByRole('radio', { name: 'Fast' }).click();
  await page.click('text=♠ Start playing');
}

/** Play (calling along) until `hands` more hands have finished. */
async function playHands(hands, onTurn) {
  let done = 0;
  for (let i = 0; i < 3000 && done < hands; i++) {
    if (await yourTurn()) {
      if (onTurn && (await onTurn())) continue;
      await page.keyboard.press('c');
    }
    if (await page.locator('text=Hand result').count()) {
      done++;
      await page.getByRole('button', { name: 'Next hand →' }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(100);
  }
  return done;
}

await page.goto(BASE_URL);
await page.evaluate(() => localStorage.clear());

// ------------------------------------------------------------ session 1
await startGame();
let rangeNote = null;
await playHands(4, async () => {
  // Facing a bet after the flop: the coach should explain what it assumes they hold.
  const street = await page.locator('span.capitalize.text-emerald-300').first().innerText().catch(() => '');
  if (rangeNote == null && (await page.getByRole('button', { name: /^Call \$/ }).count()) && /^(flop|turn|river)$/i.test(street.trim())) {
    const reveal = page.getByRole('button', { name: 'Reveal suggestion' });
    if (await reveal.count()) await reveal.click();
    const math = page.locator('text=Show the math');
    if (await math.count()) {
      await math.first().click();
      rangeNote = (await page.locator('text=/not random cards/').count()) > 0 && (await page.locator('text=/likely to have/').count()) > 0;
      await page.screenshot({ path: `${SHOT}/p-range-note.png`, fullPage: true });
    }
  }
  return false;
});
if (rangeNote != null) check('facing a bet, "show the math" explains what the coach assumes they hold', rangeNote);
else console.log('SKIP  no flop bet to call came up (range note)');

const p1 = await progress();
check('progress is saved after every hand', p1.length === 1 && p1[0].hands >= 4, JSON.stringify(p1.map((s) => s.hands)));

await page.locator('button', { hasText: '⋯' }).click();
await page.getByRole('button', { name: 'Your progress' }).click();
check('progress chart shown', (await page.getByRole('img', { name: /Average decision score per session/ }).count()) === 1);
check('progress table marks this session', (await page.locator('td', { hasText: '(now)' }).count()) === 1);
await page.locator('svg[role="img"] g[tabindex="0"]').first().hover();
check('hovering a session shows its numbers', (await page.locator('text=/Score .*\\/10 · \\d+ hands/').count()) === 1);
await page.screenshot({ path: `${SHOT}/p-progress.png` });
await page.keyboard.press('Escape');
await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 5, y: 5 } }).catch(() => {});

// Leaks panel: plain titles only.
const leaksBox = page.locator('text=Leaks to watch').locator('..');
if (await leaksBox.count()) {
  const txt = await leaksBox.innerText();
  const titles = Object.values(LEAK_TEXT).map((l) => l.title);
  check('"Leaks to watch" uses plain English', titles.some((t) => txt.includes(t)) && !/Out Of Position|Ignoring Pot Odds|Overcalling/.test(txt), txt.split('\n')[1]);
}

await page.getByRole('button', { name: '← Exit' }).click();
check('first session: no comparison yet', (await page.locator('text=/your last (session|\\d+ sessions)/').count()) === 0);
await page.getByRole('button', { name: 'Leave table' }).click();

// ------------------------------------------------------------ session 2
await startGame();
// A fresh game, not a restored one, so it's a new session.
await playHands(3);
const p2 = await progress();
check('a new sitting is a new session', p2.length === 2, `${p2.length} sessions`);
await page.getByRole('button', { name: '← Exit' }).click();
const cmp = page.locator('text=/your last session/');
check('session report compares your score with last time', (await cmp.count()) === 1, (await cmp.count()) ? await cmp.innerText() : '');
await page.screenshot({ path: `${SHOT}/p-report-compare.png`, fullPage: true });

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
