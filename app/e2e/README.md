# Browser tests

End-to-end tests that drive the real app in Chromium (via Playwright): they
play hands, use the coach, the training drills, the replayer and so on, and
check what a player would see. Each suite also saves screenshots to
`e2e/output/` (git-ignored) so you can eyeball the result.

```bash
npm run test:e2e                # every suite (starts the app itself; ~15 min)
npm run test:e2e -- training    # only suites whose file name contains "training"
E2E_URL=http://localhost:5173/ npm run test:e2e   # use an app you already have running
```

Chromium: set `PW_CHROMIUM=/path/to/chromium`, or run `npx playwright install chromium` once.

| Suite | What it covers |
| --- | --- |
| `gameplay` | A few hands with the coach on: decision scores, coach reveals, no errors |
| `freeze` | Heads-up stall detector (the old "game hangs on a bot's turn" bug) |
| `gameover` | Playing to the end: game-over screen, session report, play again |
| `session-sizing-speed` | Game speed, skipped hands, keyboard shortcuts, session report, bet sizing drill, winning-card highlight |
| `training` | Training path, every drill, spaced repetition, practise-your-mistakes, phone layout |
| `replay-notes` | Hand replayer and opponent notes, with the coach on and off |

Suites that import app code (e.g. to work out the right answer to a drill) run
through `vite-node`, which the runner uses for all of them.
