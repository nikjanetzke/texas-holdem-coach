// Shared settings for the browser tests (see e2e/README.md).
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** The running app. `npm run test:e2e` starts one on this port. */
export const BASE_URL = process.env.E2E_URL ?? 'http://localhost:5211/';

/** Screenshots land here (git-ignored) so you can look at what the tests saw. */
export const SHOT = fileURLToPath(new URL('./output', import.meta.url));
mkdirSync(SHOT, { recursive: true });

/** Launch Chromium: PW_CHROMIUM if set, the cloud sandbox's copy if present, else Playwright's own. */
export function launchBrowser() {
  const preinstalled = '/opt/pw-browsers/chromium';
  const executablePath = process.env.PW_CHROMIUM ?? (existsSync(preinstalled) ? preinstalled : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}
