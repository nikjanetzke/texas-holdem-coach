// End-to-end: hand replayer + opponent notes. Run with vite-node.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
import { CHARACTERS } from '../src/ai/characters';
import { readOpponent } from '../src/training/opponentNotes';
import { seatPosition } from '../src/pixi/seatLayout';

const URL = BASE_URL;
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

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.click('text=▶ Start');
await page.locator('input[type="number"]').first().fill('4');
await page.locator('input[type="number"]').first().blur();
await page.locator('button[role="switch"]').nth(1).click(); // coach on
await page.getByRole('radio', { name: 'Fast' }).click();
await page.click('text=♠ Start playing');

const yourTurn = () => page.locator('text=● Your turn').count();
const handNo = async () => Number((await page.locator('text=/^#\\d+$/').first().innerText()).slice(1));
const replay = page.getByRole('dialog', { name: /Replay of hand/ });

// ---------------------------------------------------------------- A. replay
// Play (calling along) until a hand ends where we made at least one decision.
let decided = false;
for (let i = 0; i < 900; i++) {
  if (await yourTurn()) { await page.keyboard.press('c'); decided = true; }
  if (decided && (await page.locator('text=Hand result').count())) break;
  if (!decided && (await page.locator('text=Hand result').count())) await page.getByRole('button', { name: 'Next hand →' }).click().catch(() => {});
  await page.waitForTimeout(120);
}
check('reached the end of a hand we played', (await page.locator('text=Hand result').count()) > 0);
const endedHand = await handNo();
const myStack = Number(((await page.locator('text=/^💰 \\$/').first().innerText()).match(/\$([\d,]+)/)?.[1] ?? '').replace(/,/g, '')) || null;
await page.getByRole('button', { name: '↺ Replay this hand' }).click();
check('"Replay this hand" opens the replay', (await replay.count()) === 1);
check('step 1: the deal and blinds, in plain English', /^Cards are dealt\. Forced bets \(the blinds\) go in:/.test(await replay.locator('[aria-live]').innerText()));
await page.screenshot({ path: `${SHOT}/r4-replay-start.png` });

// Step forward (with Next) to our first decision: the quiz asks before revealing.
let asked = false;
for (let k = 0; k < 40; k++) {
  if (await replay.locator('text=what would you do?').count()) { asked = true; break; }
  await replay.getByRole('button', { name: 'Next →' }).click();
}
check('quiz: the replay stops on your decision and asks "what would you do?"', asked);
check('quiz: Next is held until you answer', await replay.getByRole('button', { name: 'Next →' }).isDisabled());
await page.screenshot({ path: `${SHOT}/r4-replay-quiz.png` });
await replay.locator('div.border-emerald-500\\/40 button.rounded-lg').first().click();
const foundCoach =
  (await replay.locator('text=Coach suggested').count()) > 0 && (await replay.locator('text=/Your decision: \\d+\\/10/').count()) > 0;
check("after answering: what you did and the coach's verdict are shown", foundCoach && /^You /.test(await replay.locator('[aria-live]').innerText()));
check('quiz: your pick is compared with the coach', (await replay.locator('text=/You picked .* the coach\\s+suggests/').count()) === 1 && (await replay.locator('text=/Quiz so far: \\d of 1 matched/').count()) === 1);
await page.screenshot({ path: `${SHOT}/r4-replay-decision.png` });
const counter = async () => (await replay.locator('text=/^\\d+ \\/ \\d+$/').innerText()).split(' / ').map(Number);
const [a] = await counter();
await page.keyboard.press('ArrowLeft');
const [b] = await counter();
check('← / → step through the hand', b === a - 1, `${a} → ${b}`);
check('keyboard arrows did not act at the table', (await page.locator('text=Hand result').count()) > 0);
await replay.getByRole('button', { name: 'Jump to the end' }).click();
const endText = await replay.locator('[aria-live]').innerText();
check('last step says who won', /wins|win |split/.test(endText), endText);
check('pot is empty at the end', (await replay.locator('text=Pot $0').count()) === 1);
if (myStack) {
  const youRow = replay.locator('div.flex.items-center.gap-2', { hasText: 'You' }).first();
  check('your chips at the end of the replay match the table', (await youRow.innerText()).includes(`$${myStack.toLocaleString()}`), `${myStack}`);
}
// Folded opponents' cards stay hidden until asked.
const backs = async () => replay.locator('div.from-indigo-600').count();
const before = await backs();
await replay.getByLabel("Show everyone's cards").check();
const after = await backs();
check("\"Show everyone's cards\" reveals hidden hands", after < before || before === 0, `${before} → ${after} face-down`);
await page.waitForTimeout(4600); // longer than Fast auto-advance (4s)
check('the next hand waits while you replay', (await handNo()) === endedHand);
await page.keyboard.press('Escape');
check('Escape closes the replay', (await replay.count()) === 0);

// ---------------------------------------------------------------- B. opponent notes
// Play on until every opponent has been watched for 5+ hands.
for (let i = 0; i < 2000; i++) {
  if ((await handNo()) >= endedHand + 6) break;
  if (await yourTurn()) await page.keyboard.press('f');
  const next = page.getByRole('button', { name: /Next hand →|Skip to next hand →/ });
  if (await next.count()) await next.first().click().catch(() => {});
  await page.waitForTimeout(120);
}
const reads = page.getByRole('button', { name: '🔍 Reads' });
check('"🔍 Reads" button shown with the coach on', (await reads.count()) === 1);
await reads.click();
const notes = page.getByRole('dialog', { name: 'Notes on your opponents' });
check('notes dialog opens', (await notes.count()) === 1);
const cards = notes.locator('div.rounded-xl.border.p-3');
const n = await cards.count();
check('one note per opponent', n === 3, `${n}`);
let allMatch = true;
const seen = [];
for (let i = 0; i < n; i++) {
  const card = cards.nth(i);
  const name = await card.locator('span.font-semibold.text-slate-100').innerText();
  const ch = CHARACTERS.find((c) => c.shortName === name);
  const expected = readOpponent(ch, Array.from({ length: 10 }, () => ({ players: [{ id: 'x' }], actionLog: [{ street: 'preflop', playerId: 'x', type: 'fold' }] })), 'x').notes.map((x) => x.tag);
  const tags = await card.locator('span.rounded-full').allInnerTexts();
  const shown = tags.filter((t) => t !== 'Balanced');
  seen.push(`${name}: ${tags.join(', ') || '(watching)'}`);
  if (JSON.stringify(shown) !== JSON.stringify(expected)) allMatch = false;
  if (!(await card.locator('text=How to play them').count()) && !(await card.locator('text=no big weakness').count())) allMatch = false;
}
check("each opponent's notes match their real style, with advice", allMatch, seen.join(' | '));
check('notes show what you actually saw them do', (await notes.locator("text=What you've seen").count()) === n);
await page.screenshot({ path: `${SHOT}/r4-notes.png` });
await page.keyboard.press('f');
check('shortcut keys are ignored while notes are open', (await notes.count()) === 1);
await notes.getByRole('button', { name: 'Back to the table' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT}/r4-seat-tags.png` });

// Tap an opponent's seat on the canvas → their note.
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const pos = seatPosition(2, 4, 880, 500);
await page.mouse.click(box.x + (pos.x / 880) * box.width, box.y + ((pos.y - 30) / 500) * box.height);
await page.waitForTimeout(200);
check('tapping a seat opens that player\'s note', (await notes.count()) === 1 && (await notes.locator('div.border-indigo-400\\/60').count()) === 1);
await page.keyboard.press('Escape');

// ---------------------------------------------------------------- C. coach off
await page.locator('button', { hasText: '🎓 Coach' }).click();
check('coach off: no Reads button', (await reads.count()) === 0);
await page.mouse.click(box.x + (pos.x / 880) * box.width, box.y + ((pos.y - 30) / 500) * box.height);
await page.waitForTimeout(200);
check('coach off: tapping a seat opens nothing', (await notes.count()) === 0);
await page.locator('button', { hasText: '⋯' }).click();
await page.getByRole('button', { name: /^Hand history/ }).click();
const rows = page.locator('button', { hasText: '▶' });
check('hand history lists hands with your cards and result', (await rows.count()) > 3);
await page.screenshot({ path: `${SHOT}/r4-history.png` });
await rows.first().click();
check('a hand opens from the history list', (await replay.count()) === 1);
let coachShown = false;
for (let k = 0; k < 40; k++) {
  if ((await replay.locator('text=Coach suggested').count()) || (await replay.locator('text=No coach notes').count())) coachShown = true;
  await page.keyboard.press('ArrowRight');
}
check('coach off: no coach verdicts in the replay', !coachShown);
await page.keyboard.press('Escape');

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
