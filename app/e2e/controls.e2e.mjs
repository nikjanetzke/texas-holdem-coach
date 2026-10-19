// Table controls: a real pause (P / button / switching tabs), the Check/Fold
// pre-press, the result staying up while the coach is on, and "◀ Last hand".
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1366, height: 657 } });
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Ignored invalid') && errors.push(m.text()));

const yourTurn = () => page.locator('text=● Your turn').count();
const handNo = async () => Number((await page.locator('text=/^#\\d+$/').first().innerText()).slice(1));
const clock = () => page.locator('text=/^\\d+\\/\\d+ · \\d+:\\d\\d$/').first().innerText();
const pausedDialog = page.getByRole('dialog', { name: 'Game paused' });
const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('texas-holdem-coach:session:v1') || 'null'));

async function startGame({ coach }) {
  await page.goto(BASE_URL);
  await page.click('text=▶ Start');
  await page.locator('input[type="number"]').first().fill('6');
  await page.locator('input[type="number"]').first().blur();
  if (coach) await page.locator('button[role="switch"]').nth(1).click();
  await page.getByRole('radio', { name: 'Fast' }).click();
  await page.click('text=♠ Start playing');
  await page.locator('text=/^#\\d+$/').first().waitFor(); // the table is up
  await page.waitForTimeout(500);
}

await page.goto(BASE_URL);
await page.evaluate(() => localStorage.clear());

// ------------------------------------------------------------ pause
await startGame({ coach: false });
// Pause while the bots are still acting before our first turn.
await page.keyboard.press('p');
check('P pauses the game', (await pausedDialog.count()) === 1);
const hand0 = await handNo();
const turnAtPause = (await yourTurn()) > 0;
const clock0 = await clock();
await page.waitForTimeout(4500); // far longer than Fast bots take
check('while paused the blind clock stands still', (await clock()) === clock0, `${clock0} → ${await clock()}`);
check('while paused nobody acts', (await handNo()) === hand0 && ((await yourTurn()) > 0) === turnAtPause);
await page.screenshot({ path: `${SHOT}/controls-paused.png` });
await page.keyboard.press('f');
await page.waitForTimeout(300);
check('keys do nothing while paused', (await pausedDialog.count()) === 1 && ((await yourTurn()) > 0) === turnAtPause);
await page.getByRole('button', { name: '▶ Resume' }).first().click();
check('Resume un-pauses', (await pausedDialog.count()) === 0);
let resumed = false;
for (let i = 0; i < 100 && !resumed; i++) {
  if ((await yourTurn()) || (await clock()) !== clock0) resumed = true;
  await page.waitForTimeout(100);
}
check('after resuming, play carries on', resumed);
check('the top-bar button pauses too', await (async () => {
  await page.getByRole('button', { name: 'Pause the game' }).click();
  const on = (await pausedDialog.count()) === 1;
  await page.keyboard.press('p');
  return on && (await pausedDialog.count()) === 0;
})());
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(300);
check('switching away from the tab pauses the game', (await pausedDialog.count()) === 1);
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});
await page.keyboard.press('p');
await page.waitForTimeout(300);
check('P resumes after an automatic pause', (await pausedDialog.count()) === 0);

// ------------------------------------------------------------ Check/Fold
// Arm Check/Fold at the start of a hand we haven't acted in yet (folding any
// hand where our turn comes first), then let that hand play out.
let armed = false;
let armedHand = 0;
let actedHand = -1;
for (let i = 0; i < 900 && !armed; i++) {
  const n = await handNo();
  const cf = page.getByRole('button', { name: 'Check/Fold' });
  if ((await yourTurn()) && n !== armedHand) {
    actedHand = n;
    await page.keyboard.press('f');
  } else if (n !== actedHand && !(await yourTurn()) && (await cf.count()) && !(await page.locator('text=Hand result').count())) {
    // Click it directly (our turn can arrive mid-click and remove the button;
    // then just try again), and judge by the status line, not the click.
    await cf.evaluate((b) => b.click()).catch(() => {});
    await page.waitForTimeout(100);
    if ((await page.locator('text=/Check\\/Fold on/').count()) === 1) {
      armedHand = n;
      armed = true;
      break;
    }
  } else {
    await page.keyboard.press('n'); // next hand (only does anything once the hand is over or we've folded)
  }
  await page.waitForTimeout(40);
}
check('Check/Fold can be armed while waiting', armed);
// The pre-press plays for us — we press nothing until the hand is over.
for (let i = 0; i < 300 && (await handNo()) === armedHand && !(await page.locator('text=Hand result').count()); i++) {
  await page.waitForTimeout(100);
}
await page.waitForTimeout(500);
{
  const s = await session();
  const hand = s?.handHistory?.find((h) => h.handNumber === armedHand);
  const mine = (hand?.actionLog ?? []).filter((e) => e.playerId === 'human' && !e.forced);
  const kinds = mine.map((e) => e.type);
  const okKinds = kinds.every((k) => k === 'check' || k === 'fold') && kinds.filter((k) => k === 'fold').length <= 1;
  check('Check/Fold only ever checked or folded, for the whole hand', !!hand && okKinds, kinds.join(', ') || '(no decisions left)');
}

// ------------------------------------------------------------ coach on: the result waits; Last hand
await page.getByRole('button', { name: '← Exit' }).click();
const leave = page.getByRole('button', { name: 'Leave table' });
if (await leave.count()) await leave.click();
await startGame({ coach: true });
let decided = false;
for (let i = 0; i < 900; i++) {
  if (await yourTurn()) { await page.keyboard.press('c'); decided = true; }
  if (decided && (await page.locator('text=Hand result').count())) break;
  if (!decided && (await page.locator('text=Hand result').count())) await page.getByRole('button', { name: 'Next hand →' }).click().catch(() => {});
  await page.waitForTimeout(100);
}
const resultHand = await handNo();
check('coach on: says the next hand waits for you', (await page.locator('text=the next hand waits for you').count()) === 1);
await page.waitForTimeout(6000); // longer than Fast auto-advance (4s)
check('coach on: the result stays up until you click Next hand', (await handNo()) === resultHand && (await page.locator('text=Hand result').count()) === 1);
await page.getByRole('button', { name: 'Next hand →' }).click();
await page.waitForTimeout(400);
const lastBtn = page.getByRole('button', { name: 'Last hand', exact: true });
check('"◀ Last hand" appears once a hand is finished', (await lastBtn.count()) === 1);
await lastBtn.click();
const last = page.getByRole('dialog', { name: /Last hand, number/ });
check('Last hand opens a summary', (await last.count()) === 1 && (await last.locator('text=Your decisions').count()) === 1);
check("Last hand shows the coach's verdict on your decisions", (await last.locator('text=Coach suggested').count()) > 0 && (await last.locator('text=/\\d+\\/10/').count()) > 0);
await page.screenshot({ path: `${SHOT}/controls-last-hand.png` });
await last.getByRole('button', { name: '↺ Step-by-step replay' }).click();
check('…and links to the full replay', (await page.getByRole('dialog', { name: /Replay of hand/ }).count()) === 1);
await page.keyboard.press('Escape');

// Coach off: no Last hand button; auto next hand works again.
await page.locator('button', { hasText: '🎓 Coach' }).click();
check('coach off: no Last hand button', (await lastBtn.count()) === 0);
await page.locator('button', { hasText: '⋯' }).click();
check('"Auto next hand" switch is in the menu', (await page.getByRole('switch', { name: 'Auto next hand' }).count()) === 1);
await page.keyboard.press('Escape');
await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 5, y: 5 } }).catch(() => {});

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
