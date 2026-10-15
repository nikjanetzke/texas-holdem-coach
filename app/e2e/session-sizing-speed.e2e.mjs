// End-to-end test: session report, bet sizing drill, game speed, keyboard
// shortcuts, plus screenshots for the visual changes. Run with vite-node.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
import { boardTexture, correctSizes, SIZES } from '../src/training/sizingDrill';

const URL = BASE_URL;
const SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function startQuickGame({ players = 6, speed = 'Fast', coach = true } = {}) {
  await page.goto(URL);
  await page.click('text=▶ Start');
  await page.locator('input[type="number"]').first().fill(String(players));
  await page.locator('input[type="number"]').first().blur();
  if (coach) await page.locator('button[role="switch"]').nth(1).click();
  await page.getByRole('radio', { name: speed }).click();
  await page.click('text=♠ Start playing');
}
const yourTurn = () => page.locator('text=● Your turn').count();

// ------------------------------------------------------------ A. game speed
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.click('text=▶ Start');
check('speed picker on the setup screen, Normal by default', (await page.getByRole('radio', { name: 'Normal' }).getAttribute('aria-checked')) === 'true');
await page.getByRole('radio', { name: 'Fast' }).click();
check('speed choice is remembered', (await page.evaluate(() => localStorage.getItem('texas-holdem-coach:pref:bot-speed:v1'))) === '"fast"');

// Measure: how long until it's our turn, from the deal, across several hands.
async function averageWaitForTurn(hands) {
  const waits = [];
  for (let h = 0; h < hands; h++) {
    const t0 = Date.now();
    let waited = 0;
    while (!(await yourTurn()) && waited < 30000) {
      await page.waitForTimeout(100);
      waited = Date.now() - t0;
    }
    waits.push(Date.now() - t0);
    await page.keyboard.press('f'); // fold fast to move on (also exercises the shortcut)
    for (let i = 0; i < 60; i++) {
      const skip = page.getByRole('button', { name: /Skip to next hand →|Next hand →/ });
      if (await skip.count()) { await skip.first().click().catch(() => {}); break; }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(300);
  }
  return waits.reduce((a, b) => a + b, 0) / waits.length;
}
await page.click('text=♠ Start playing');
const fastWait = await averageWaitForTurn(4);
check('fast opponents: under 4s average wait for your turn (6 players)', fastWait < 4000, `${Math.round(fastWait)}ms`);
await page.locator('button', { hasText: '⋯' }).click();
check('speed picker in the in-game menu shows Fast', (await page.getByRole('radio', { name: 'Fast' }).getAttribute('aria-checked')) === 'true');
await page.getByRole('radio', { name: 'Relaxed' }).click();
await page.keyboard.press('Escape');
await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 5, y: 5 } }).catch(() => {});
const relaxedWait = await averageWaitForTurn(3);
check('switching to Relaxed mid-game slows opponents down', relaxedWait > fastWait * 1.8, `${Math.round(relaxedWait)}ms vs ${Math.round(fastWait)}ms`);
await page.locator('button', { hasText: '⋯' }).click();
await page.getByRole('radio', { name: 'Fast' }).click();
await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 5, y: 5 } }).catch(() => {});

// ------------------------------------------------------------ A2. skipping a folded hand
// Every hand above was folded and skipped. Each must now be played out and
// recorded, with not a single chip created or destroyed.
{
  await page.waitForTimeout(500);
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('texas-holdem-coach:session:v1') || 'null'));
  const totalChips = Object.values(sess.stacks).reduce((a, b) => a + b, 0);
  check('skipped hands are recorded in history', sess.handHistory.length >= sess.handNumber - 2, `${sess.handHistory.length} recorded, on hand #${sess.handNumber}`);
  check('skipping keeps every chip accounted for', totalChips === 6 * 10000, `total ${totalChips}`);
  const lastSkipped = sess.handHistory[0];
  check('a skipped hand was played out to the end (has a result)', !!lastSkipped?.showdownResult);
}

// ------------------------------------------------------------ B. keyboard
for (let i = 0; i < 200 && !(await yourTurn()); i++) await page.waitForTimeout(100);
check('keyboard hint shown on desktop', (await page.locator('text=⌨ F fold').count()) > 0);
const canCheck = (await page.getByRole('button', { name: 'Check', exact: true }).count()) > 0;
const streetChip = () => page.locator('span.capitalize.text-emerald-300').first().innerText().catch(() => '?');
const streetBefore = await streetChip();
await page.keyboard.press('c');
await page.waitForTimeout(300);
const stillMyTurnWithSameButtons = (await yourTurn()) > 0 && (await page.locator('text=⌨ F fold').count()) > 0 &&
  (await page.getByRole('button', { name: canCheck ? 'Check' : /^Call \$/, exact: canCheck }).count()) > 0;
// Fast bots can hand the turn straight back on the next street, so a street change counts as "moved on" too.
check(`"C" ${canCheck ? 'checks' : 'calls'} — the turn moves on`, !stillMyTurnWithSameButtons || (await streetChip()) !== streetBefore);

// ------------------------------------------------------------ C. session report
// Play until a free check is folded (a guaranteed leak), then leave.
let folded = false;
for (let i = 0; i < 600 && !folded; i++) {
  if (await yourTurn()) {
    if (await page.getByRole('button', { name: 'Check', exact: true }).count()) {
      await page.keyboard.press('f');
      folded = true;
      break;
    }
    await page.keyboard.press('c');
  }
  const next = page.getByRole('button', { name: /Next hand →|Skip to next hand →/ });
  if (await next.count()) await next.first().click().catch(() => {});
  await page.waitForTimeout(150);
}
check('folded a free check during play', folded);
for (let i = 0; i < 80; i++) {
  if (await page.locator('text=Hand result').count()) break;
  await page.waitForTimeout(150);
}
await page.screenshot({ path: `${SHOT}/r3-showdown.png`, fullPage: true });
const sessBeforeExit = await page.evaluate(() => JSON.parse(localStorage.getItem('texas-holdem-coach:session:v1') || 'null'));
await page.getByRole('button', { name: '← Exit' }).click();
await page.waitForTimeout(200);
check('Exit opens the session report first', (await page.locator('text=Session report').count()) > 0);
const reportText = await page.locator('text=Session report').locator('..').innerText();
const handsPlayed = Number(reportText.match(/(\d+)\s*\n\s*Hands played/i)?.[1] ?? reportText.match(/(\d+)\nHANDS PLAYED/)?.[1] ?? -1);
check('report counts every completed hand this session (incl. skipped ones)', handsPlayed === sessBeforeExit.handHistory.length && handsPlayed >= 4, `${handsPlayed} in report, ${sessBeforeExit.handHistory.length} recorded`);
check('report lists the free-check fold as a leak', (await page.locator('text=Folding when you could check').count()) > 0);
await page.screenshot({ path: `${SHOT}/r3-report.png`, fullPage: true });
await page.getByRole('button', { name: 'Back to the table' }).click();
check('"Back to the table" returns to play', (await page.locator('text=Session report').count()) === 0 && (await page.getByRole('button', { name: '← Exit' }).count()) > 0);
await page.getByRole('button', { name: '← Exit' }).click();
await page.getByRole('button', { name: /Practise: Practise your mistakes/ }).click();
await page.waitForTimeout(300);
check('"Practise" lands on that drill in Training', (await page.locator('text=PRACTISE YOUR MISTAKES').count()) + (await page.locator('text=Practise your mistakes').count()) > 0 &&
  ((await page.locator('text=You\'ve seen this spot before').count()) > 0 || (await page.locator('text=All caught up for now.').count()) > 0));

// ------------------------------------------------------------ D. bet sizing drill
await page.locator('button', { hasText: 'Unlock all levels' }).click();
const lvl5 = page.locator('button', { hasText: /^5\. Bet sizing/ });
check('bet sizing is level 5 of the path', (await lvl5.count()) === 1);
await lvl5.click();
await page.waitForTimeout(200);
async function readSizing() {
  const boxes = page.locator('div.bg-emerald-950\\/30 div.flex.gap-1\\.5');
  const read = async (i) =>
    (await boxes.nth(i).locator(':scope > div').allInnerTexts()).map((t) => {
      const [r, s] = t.split('\n').map((x) => x.trim());
      return { rank: r === '10' ? 'T' : r, suit: SUIT[s] };
    });
  return { hero: await read(0), board: await read(1) };
}
let sizingRight = 0, sizingTotal = 0;
let missedBoard = null, reviewBack = false;
for (let i = 0; i < 6; i++) {
  const { board } = await readSizing();
  const tex = boardTexture(board);
  const isReview = (await page.locator('text=Review — you missed this one before').count()) > 0;
  if (isReview && missedBoard && JSON.stringify(board) === missedBoard) reviewBack = i === 3;
  const right = correctSizes(tex);
  // Get question 1 wrong on purpose; answer the rest correctly.
  const pick = i === 0 ? SIZES.find((s) => !right.includes(s.id)) : SIZES.find((s) => right.includes(s.id));
  if (i === 0) missedBoard = JSON.stringify(board);
  await page.locator('div.grid.grid-cols-4 > button', { hasText: pick.label }).first().click();
  const ok = (await page.locator('text=Correct!').count()) > 0;
  sizingTotal++;
  if (ok === (i !== 0)) sizingRight++;
  if (i === 0) await page.screenshot({ path: `${SHOT}/r3-sizing-wrong.png`, fullPage: true });
  if (i === 1) await page.screenshot({ path: `${SHOT}/r3-sizing-right.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next hand →' }).click();
}
check('sizing drill grades by board texture (engine agrees on every question)', sizingRight === sizingTotal, `${sizingRight}/${sizingTotal}`);
check('a missed sizing question comes back 3 questions later', reviewBack);

// ------------------------------------------------------------ E. visuals: 4-player table (edge seats)
await startQuickGame({ players: 4, speed: 'Fast', coach: false });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT}/r3-four-players.png` });
for (let i = 0; i < 1200; i++) {
  if (await page.locator('text=Showdown').count()) break; // a real showdown, for the highlight shot
  if (await yourTurn()) await page.keyboard.press('c');
  const next = page.getByRole('button', { name: 'Next hand →' });
  if (await next.count()) await next.click().catch(() => {});
  await page.waitForTimeout(150);
}
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOT}/r3-highlight.png` });
check('reached a showdown for the winning-cards screenshot', (await page.locator('text=Showdown').count()) > 0);

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
