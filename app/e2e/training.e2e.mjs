// End-to-end test of the training features, run with vite-node so it can use
// the app's own engine to compute correct answers from what's on screen.
import { BASE_URL, SHOT, launchBrowser } from './env.mjs';
import { chenBreakdown } from '../src/engine/preflop';
import { verdictFor } from '../src/training/positionDrill';

const URL = BASE_URL;
const SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function readBigCards() {
  const texts = await page.locator('div.h-28.w-20').allInnerTexts();
  return texts.map((t) => {
    const [r, s] = t.split('\n').map((x) => x.trim());
    return { rank: r === '10' ? 'T' : r, suit: SUIT[s] };
  });
}
const band = (score) => (score >= 10 ? 'Premium' : score >= 8 ? 'Strong' : score >= 6 ? 'Playable' : score >= 4 ? 'Marginal' : 'Weak');
const handClass = (cards) => {
  const order = 'AKQJT98765432';
  const [a, b] = [...cards].sort((x, y) => order.indexOf(x.rank) - order.indexOf(y.rank));
  return a.rank === b.rank ? a.rank + b.rank : a.rank + b.rank + (a.suit === b.suit ? 's' : 'o');
};
async function openTraining() {
  await page.goto(URL);
  await page.click('text=▶ Start');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.waitForTimeout(300);
}
const levelButton = (n) => page.locator('button', { hasText: new RegExp(`^${n}\\. `) });

// ---------------------------------------------------------------- A. path
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await openTraining();
await page.screenshot({ path: `${SHOT}/e2e-hub-fresh.png`, fullPage: true });
check('fresh player: level 1 is "Next up"', (await levelButton(1).innerText()).includes('Next up'));
check('fresh player: level 2 locked', await levelButton(2).isDisabled());
check('fresh player: level 4 locked', await levelButton(4).isDisabled());
check('mistakes card shows 0 saved', (await page.locator('button', { hasText: 'Practise your mistakes' }).innerText()).includes('0 saved'));

// ---------------------------------------------------------------- B. master level 1 for real
let wrongChen = 0;
for (let i = 0; i < 20; i++) {
  const cards = await readBigCards();
  const want = band(chenBreakdown(cards).score);
  await page.locator('button', { hasText: new RegExp(`^${want}`) }).first().click();
  const verdict = await page.locator('text=/Correct!|Not quite/').first().innerText();
  if (!verdict.startsWith('Correct')) wrongChen++;
  if (i === 9) await page.screenshot({ path: `${SHOT}/e2e-chen-progress.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next hand →' }).click();
}
check('answered 20 starting-hand questions correctly', wrongChen === 0, `${wrongChen} wrong`);
await page.waitForTimeout(200);
const toastText = (await page.locator('text=/mastered —/').count()) ? await page.locator('text=/mastered —/').first().innerText() : '';
check('mastery toast appears', toastText.includes('Play or fold by seat'), toastText.slice(0, 80));
check('level 1 now shows Mastered', (await levelButton(1).innerText()).includes('Mastered'));
check('level 2 unlocked and Next up', !(await levelButton(2).isDisabled()) && (await levelButton(2).innerText()).includes('Next up'));
check('level 3 still locked', await levelButton(3).isDisabled());
await page.screenshot({ path: `${SHOT}/e2e-hub-after-mastery.png`, fullPage: true });

// ---------------------------------------------------------------- C. position drill + spaced review
await levelButton(2).click();
await page.waitForTimeout(200);
async function readPosition() {
  const cells = await page.locator('div.grid.grid-cols-6 > div').allInnerTexts();
  const seat = ['early', 'middle', 'cutoff', 'button'][cells.findIndex((t) => t.trim() === 'YOU')];
  return { seat, cls: handClass(await readBigCards()) };
}
// Q1: answer deliberately WRONG and remember it.
const missed = await readPosition();
const rightAnswer = verdictFor(missed.cls, missed.seat);
await page.getByRole('button', { name: rightAnswer === 'play' ? 'Fold' : 'Play (raise)', exact: true }).click();
check('wrong position answer is marked wrong', (await page.locator('text=Not quite.').count()) > 0);
check('"same hand, every seat" table shown', (await page.locator('text=Same hand, every seat').count()) > 0);
await page.screenshot({ path: `${SHOT}/e2e-position-reveal.png`, fullPage: true });
check('review counter shows 1 to review', (await page.locator('text=🔁 1 to review').count()) > 0);
await page.getByRole('button', { name: 'Next hand →' }).click();

// Next questions answered correctly; the missed one must come back as a review.
let reviewSeenAt = -1;
let reviewMatches = false;
for (let i = 0; i < 4; i++) {
  const isReview = (await page.locator('text=Review — you missed this one before').count()) > 0;
  const cur = await readPosition();
  if (isReview && reviewSeenAt < 0) {
    reviewSeenAt = i + 2; // question number
    reviewMatches = cur.cls === missed.cls && cur.seat === missed.seat;
    await page.screenshot({ path: `${SHOT}/e2e-position-review.png`, fullPage: true });
  }
  const v = verdictFor(cur.cls, cur.seat);
  await page.getByRole('button', { name: v === 'play' ? 'Play (raise)' : 'Fold', exact: true }).click();
  await page.getByRole('button', { name: 'Next hand →' }).click();
}
check('missed spot came back as a review', reviewSeenAt > 0, `on question ${reviewSeenAt}`);
check('review is the exact same hand and seat', reviewMatches, `${missed.cls}@${missed.seat}`);
check('review came back after 3 more questions (question 4)', reviewSeenAt === 4);

// ---------------------------------------------------------------- D. mistakes from real play
await page.evaluate(() => {
  // Keep training progress, but make sure no old game session is restored.
  localStorage.removeItem('texas-holdem-coach:session:v1');
});
await page.goto(URL);
await page.click('text=▶ Start');
await page.locator('input[type="number"]').first().fill('3');
await page.locator('input[type="number"]').first().blur();
await page.locator('button[role="switch"]').nth(1).click(); // coaching on (shows the 📌 note)
await page.click('text=♠ Start playing');
let folded = false;
for (let i = 0; i < 480 && !folded; i++) {
  const check_ = page.getByRole('button', { name: 'Check', exact: true });
  const yourTurn = (await page.locator('text=● Your turn').count()) > 0;
  if (yourTurn && (await check_.count())) {
    await page.getByRole('button', { name: 'Fold', exact: true }).click();
    folded = true;
    break;
  }
  if (yourTurn) {
    const call = page.getByRole('button', { name: /^Call \$/ });
    if (await call.count()) await call.click().catch(() => {});
  }
  const next = page.getByRole('button', { name: /Next hand →|Skip to next hand →/ });
  if (await next.count()) await next.first().click().catch(() => {});
  await page.waitForTimeout(250);
}
if (!folded) {
  await page.screenshot({ path: `${SHOT}/dbg-nofold.png`, fullPage: true });
  console.log('   page text at give-up:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
}
check('found a free-check spot and folded it', folded);
// Let the hand finish so the summary shows.
// Wait for the hand to finish naturally (don't skip — that jumps past the
// result panel being checked). Bots act within ~3s each.
for (let i = 0; i < 120; i++) {
  if (await page.locator('text=Saved to “Practise your mistakes”').count()) break;
  await page.waitForTimeout(250);
}
check('hand summary notes the mistake was saved', (await page.locator('text=Saved to “Practise your mistakes”').count()) > 0);
await page.screenshot({ path: `${SHOT}/e2e-game-saved.png`, fullPage: true });

await page.getByRole('button', { name: '← Exit' }).click();
await page.waitForTimeout(300);
// Leaving now shows the session report first.
if (await page.locator('text=Session report').count()) await page.getByRole('button', { name: 'Leave table' }).click();
await page.waitForTimeout(300);
if (await page.locator('text=▶ Start').count()) await page.click('text=▶ Start');
await page.getByRole('button', { name: 'Training', exact: true }).click();
const mCard = page.locator('button', { hasText: 'Practise your mistakes' });
// The test calls its way to the flop, so a genuinely bad call may ALSO have
// been saved. Inspect every saved spot so each can be sanity-checked.
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('texas-holdem-coach:srs:mistakes:v1') || '{"cards":[]}').cards.map((c) => c.item));
for (const m of saved) {
  console.log(`   saved ${m.kind}: ${m.holeCards.map((c) => c.rank + c.suit).join(' ')} | board ${m.board.map((c) => c.rank + c.suit).join(' ') || '-'} | pot ${m.pot} toCall ${m.toCall} | equity ${m.equityPercent.toFixed(1)}% vs needed ${m.potOddsPercent.toFixed(1)}% | did ${m.actualAction}`);
}
const sane = saved.every((m) =>
  m.kind === 'freefold' ? m.toCall === 0 && m.actualAction === 'fold'
  : m.kind === 'overcall' ? m.actualAction === 'call' && m.equityPercent < m.potOddsPercent - 15
  : m.actualAction === 'fold' && m.equityPercent >= 50 && m.equityPercent >= m.potOddsPercent + 20);
check('every saved spot genuinely meets its mistake rule', sane, `${saved.length} saved`);
check('the free-check fold was among them', saved.some((m) => m.kind === 'freefold'));
check('mistakes card shows them as due', (await mCard.innerText()).includes(`${saved.length} due`), (await mCard.innerText()).replace(/\n/g, ' '));
await mCard.click();
await page.waitForTimeout(200);
// Answer every due spot correctly: Check when it was free, otherwise Fold
// (overcall) or Call (overfold), judged from the spot shown.
let answered = 0;
for (let i = 0; i < saved.length; i++) {
  if (await page.locator('text=All caught up for now.').count()) break;
  const free = (await page.locator('text=Nothing').count()) > 0;
  if (i === 0) await page.screenshot({ path: `${SHOT}/e2e-mistake-question.png`, fullPage: true });
  const shownHole = (await page.locator('div.bg-emerald-950\\/30').first().innerText());
  const match = saved.find((m) => (free ? m.toCall === 0 : m.toCall > 0));
  const answer = free ? 'Check' : match?.kind === 'overfold' ? 'Call' : 'Fold';
  await page.getByRole('button', { name: answer, exact: true }).click();
  check(`replayed spot ${i + 1} (${free ? 'free check' : match?.kind}) graded correct`, (await page.locator('text=Correct!').count()) > 0);
  if (free) check('explains why folding a free check is wrong', (await page.locator('text=/never correct/').count()) > 0);
  check(`spot ${i + 1}: progress shows 1 of 3`, (await page.locator('text=Right 1 of 3 times in a row').count()) > 0);
  if (i === 0) await page.screenshot({ path: `${SHOT}/e2e-mistake-answer.png`, fullPage: true });
  answered++;
  await page.getByRole('button', { name: 'Next spot →' }).click();
  await page.waitForTimeout(150);
  void shownHole;
}
check('every due spot was served once', answered === saved.length);
check('spaced: after correct answers nothing is served again straight away', (await page.locator('text=All caught up for now.').count()) > 0);
await page.screenshot({ path: `${SHOT}/e2e-mistake-caughtup.png`, fullPage: true });
await page.getByRole('button', { name: 'Practise early anyway' }).click();
{
  const free = (await page.locator('text=Nothing').count()) > 0;
  const m = saved.find((x) => (free ? x.toCall === 0 : x.toCall > 0));
  await page.getByRole('button', { name: free ? 'Check' : m?.kind === 'overfold' ? 'Call' : 'Fold', exact: true }).click();
}
check('early practice does not count towards clearing', (await page.locator('text=/Early practice/').count()) > 0);

// ---------------------------------------------------------------- E. other drills still work + review badge in outs
await levelButton(1).click(); // mastered levels stay open
await page.waitForTimeout(200);
check('mastered level still opens', (await page.locator('text=How strong is this hand?').count()) > 0);
await page.locator('button', { hasText: 'Unlock all levels' }).click();
check('"Unlock all" opens level 4', !(await levelButton(4).isDisabled()));
await levelButton(3).click();
await page.waitForTimeout(200);
// Answer blindly (first option) and record which questions were actually
// wrong; the first miss must come back exactly 3 questions later.
const spotText = () => page.locator('div.bg-emerald-950\\/30').first().innerText();
const log = [];
for (let i = 0; i < 9; i++) {
  const isReview = (await page.locator('text=Review — you missed this one before').count()) > 0;
  const text = await spotText();
  await page.locator('div.grid.grid-cols-4 > button').first().click();
  const wrong = (await page.locator('text=Correct!').count()) === 0;
  log.push({ isReview, text, wrong });
  await page.getByRole('button', { name: /Next hand →|Next spot →/ }).click();
}
const firstMiss = log.findIndex((q) => q.wrong && !q.isReview);
const back = firstMiss >= 0 ? log[firstMiss + 3] : undefined;
const outsReviewOk = firstMiss >= 0 && firstMiss + 3 < log.length && !!back?.isReview && back.text === log[firstMiss].text;
if (back?.isReview) await page.screenshot({ path: `${SHOT}/e2e-outs-review.png`, fullPage: true });
console.log(`   outs log: ${log.map((q) => (q.isReview ? 'R' : '') + (q.wrong ? 'x' : 'v')).join(' ')}`);
check('outs drill: the first miss returns as the same spot 3 questions later', outsReviewOk, `first miss on q${firstMiss + 1}`);
await levelButton(4).click();
await page.waitForTimeout(200);
check('fold/call/raise drill renders', (await page.locator('text=Step 1 — how many outs do you have?').count()) > 0);

// ---------------------------------------------------------------- F. mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await levelButton(2).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOT}/e2e-mobile-position.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('no horizontal scroll on a phone', overflow <= 1, `overflow ${overflow}px`);

await page.locator('button', { hasText: 'Your training path' }).click();
await page.waitForTimeout(150);
check('path collapses to one line', (await levelButton(1).count()) === 0 && (await page.locator('text=/mastered$/').count()) > 0);
check('drill still usable while collapsed', (await page.getByRole('button', { name: 'Play (raise)', exact: true }).count()) > 0);
await page.screenshot({ path: `${SHOT}/e2e-mobile-collapsed.png`, fullPage: true });
await page.reload();
if (await page.locator('text=▶ Start').count()) await page.click('text=▶ Start');
await page.getByRole('button', { name: 'Training', exact: true }).click();
check('collapsed choice is remembered', (await levelButton(1).count()) === 0);
await page.locator('button', { hasText: 'Your training path' }).click();
check('path expands again', (await levelButton(1).count()) === 1);
// Polished explanation text.
await levelButton(2).click();
await page.getByRole('button', { name: 'Fold', exact: true }).click();
const exp = await page.getByTestId('hand-name').innerText();
check('hand name is sentence case', /^(A pair of|[2-9AKQJ1][0-9]?-)/.test(exp) && !/ Same| Different/.test(exp), exp);

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
