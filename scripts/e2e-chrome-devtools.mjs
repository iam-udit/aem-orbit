/**
 * @file End-to-End Chrome DevTools QA & Regression Runner for AEM Orbit.
 * @module scripts/e2e-chrome-devtools
 *
 * Executes live browser automation against local & proxied cloud WKND AEM servers:
 *   - Local (http://localhost:4502, :4503)
 *   - Dev (https://dev-cloud-author.com, :4512/4513, https://wwwdev.wknd.com)
 *   - Stage (https://stage-cloud-author.com, :4522/4523, https://wwwstage.wknd.com)
 *   - Prod (https://prod-cloud-author.com, :4532/4533, https://www.wknd.com — protected)
 *   - Edge Proxy / Dispatcher Simulator (127.0.0.1:8443 / :8480)
 *
 * Usage:
 *   npm run test:e2e                  Run all E2E suites headlessly in Chrome for Testing
 *   node scripts/e2e-chrome-devtools.mjs --headed          Show Chrome window while running
 *   node scripts/e2e-chrome-devtools.mjs --suite=02        Run matching suite(s) only
 *
 * Adding future test suites:
 *   1. Create `scripts/e2e/suites/06-my-feature.mjs` exporting `{ name, run(ctx, test) }`.
 *   2. Import and append it to the `SUITES` array below.
 */

import process from 'node:process';
import { runE2eSuites } from './e2e/harness.mjs';
import suite01 from './e2e/suites/01-options-and-personas.mjs';
import suite02 from './e2e/suites/02-toolbar-personas-and-scroll.mjs';
import suite03 from './e2e/suites/03-qa-audit-cache-and-inspect.mjs';
import suite04 from './e2e/suites/04-jcr-versions-diff-sync.mjs';
import suite05 from './e2e/suites/05-popup-workspace-and-security.mjs';

const SUITES = [
  suite01,
  suite02,
  suite03,
  suite04,
  suite05,
];

const suiteFlag = process.argv.find((a) => a.startsWith('--suite='));
const filter = suiteFlag ? suiteFlag.slice('--suite='.length) : '';
const headless = !process.argv.includes('--headed');

const { failed } = await runE2eSuites(SUITES, { filter, headless });
if (failed > 0) process.exit(1);
