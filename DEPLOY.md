# Deploying Poker IQ to poker.buildai.nz

## Verified release — 21 October 2026 NZ

- Production: https://poker.buildai.nz. Release source on `main`: `3d052bd602f1117ead354077ecfac92612dcad21`; includes the preceding laptop-layout/all-in fix (`682ea3b`). The historical branch instructions below predate the current `main` release workflow.
- Changes: real pause and tab-switch pause, Check/Fold, coach-on result waiting, Last hand, pinned actions and responsive no-page-scroll layouts.
- Isolated Node 22.23.3; `npm ci`, all **176 unit tests across 19 files**, and TypeScript/Vite production build passed. Targeted Chromium E2E: **20/20 controls** and **91/91 layout** checks passed. Other E2E suites were not rerun for this release.
- Direct Pages production deployment: **`231eb98c-9554-41c1-990a-00ea41c4bd45`**, independently confirmed as canonical with the correct source commit. Previous deployment retained for rollback: **`4286cba0-ab85-44f2-a95f-84d23a51c2b8`**. No DNS, application-source or user-storage changes by Hermes.
- Live verification: homepage, entry JS/runtime/CSS and sample splash/table/avatar images returned HTTP 200 with expected MIME types and byte-identical contents to `app/dist`. Live browser started a game and displayed the new Game paused dialog; screenshot reviewed. No broad zone cache purge was necessary.
- Dependency audit: **7 existing findings (3 moderate, 4 high)**. This release does not change package manifests or lockfile. Findings include build/test tooling and transitive `@xmldom/xmldom`; record for separate dependency remediation, not a claim that all are dev-only or exploitable in the deployed app. No automatic dependency upgrades were applied.
- E2E environment: used `E2E_URL=http://127.0.0.1:5211/` against an explicitly loopback-bound Vite server and `PW_CHROMIUM` pointing to an installed headless Chromium. Default runner startup via localhost failed here, and Playwright's expected downloaded browser revision was absent; explicit supported overrides resolved both without source edits.
- Refresh open Poker tabs to load the new bundle. Evidence logs and live checks are retained locally under `/opt/data/reports/poker-release-20261021/`.

---

The app is a static Vite/React build. The Cloudflare Pages project is
**`texas-holdem-coach`** (`texas-holdem-coach.pages.dev` → `poker.buildai.nz`).

- All current work lives on branch **`claude/dreamy-clarke-1dxvcv`**.
- The app lives in the **`app/`** subfolder. Build output is **`app/dist/`**.
- Build command: `npm run build` · Output dir: `dist` · **Root dir: `app`**

Pick **Path A** (most reliable) or **Path B** (if Pages auto-builds on push).

---

## Path A — Direct deploy with Wrangler (recommended)

Uploads the built output straight to production. No git merge needed; works
regardless of how Pages is wired.

```bash
cd /path/to/texas-holdem-coach
git checkout claude/dreamy-clarke-1dxvcv
git pull origin claude/dreamy-clarke-1dxvcv

cd app
npm install
npm run build        # produces app/dist/

npx wrangler pages deploy dist \
  --project-name texas-holdem-coach \
  --branch main
```

Requires Cloudflare auth — either the `CLOUDFLARE_API_TOKEN` env var, or a
prior `wrangler login`. (hermes set the project up, so it should already have
credentials.)

---

## Path B — Git-connected auto-deploy

If Pages auto-builds when its production branch is pushed, just get the code
onto that branch (usually `main`):

```bash
cd /path/to/texas-holdem-coach
git checkout main
git pull origin main
git merge origin/claude/dreamy-clarke-1dxvcv
git push origin main
```

Cloudflare then rebuilds automatically. **Required Pages build settings:**

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None / Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Root directory** | **`app`**  ← common gotcha |

If the root directory isn't `app`, the build fails to find the project.

---

## After deploying: purge the cache

Earlier visits may have cached `/avatars/*.jpg` as 404s (from before those
files existed), which is why character photos can fail to appear. After any
deploy:

1. Cloudflare dashboard → the `buildai.nz` zone → **Caching → Purge Everything**
   (or purge just `poker.buildai.nz/avatars/*`).
2. Hard-refresh the browser (Ctrl/Cmd-Shift-R).

### Verify it worked

In the browser dev tools → Network tab, reload and confirm these return **200**:

- `/assets/poker-iq-splash.jpg`
- `/assets/green-felt-poker-table.jpg`
- `/avatars/marco.jpg` (and the other 8 characters)

If any return 404 on the live site but exist in the repo under
`app/public/...`, it's a stale cache or a deploy that predates those files —
redeploy (Path A) and purge again.
