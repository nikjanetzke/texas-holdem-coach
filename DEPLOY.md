# Deploying Poker IQ to poker.buildai.nz

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
