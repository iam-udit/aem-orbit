/**
 * @file Extensible Chrome DevTools Protocol (CDP) E2E Test Harness for AEM Orbit.
 * @module e2e/harness
 *
 * Launches Chrome for Testing (or attaches to an existing CDP endpoint via `ORBIT_CDP`),
 * builds an unpacked E2E extension bundle from `src/` with WKND host permissions granted,
 * routes `*.wknd.com` / `*-cloud-*.com` domains through the local edge proxy (`127.0.0.1:8443`),
 * and exposes assertion, screenshot, and suite orchestration utilities.
 *
 * To add regression coverage for new features, add a suite module under `scripts/e2e/suites/`
 * exporting `{ name, run(ctx) }` and register it in `scripts/e2e-chrome-devtools.mjs`.
 */

import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const E2E_EXT_DIR = path.join(ROOT, 'dist', 'e2e-extension');
const SCREENSHOT_DIR = path.join(ROOT, 'dist', 'screenshots');
const DEFAULT_CDP_PORT = Number(process.env.ORBIT_E2E_PORT || 9335);
const DEFAULT_PROFILE_DIR = process.env.ORBIT_E2E_PROFILE || '/tmp/orbit-e2e-qa-profile';

const CHROME_CANDIDATES = [
  path.join(ROOT, 'video/build/browser/chrome/mac_arm-158.0.8127.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * CDP WebSocket wrapper for a single browser page, popup, or service worker target.
 */
export class CdpTarget {
  /**
   * @param {object} info - Raw target metadata entry from CDP `/json/list`.
   * @param {string} baseUrl - Base HTTP URL of the Chrome DevTools endpoint.
   */
  constructor(info, baseUrl) {
    this.info = info;
    this.baseUrl = baseUrl;
    this.id = 0;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.ws = null;
  }

  /** Opens the CDP WebSocket connection and enables Page/Runtime domains. */
  async connect() {
    this.ws = new WebSocket(this.info.webSocketDebuggerUrl);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method && this.eventListeners.has(msg.method)) {
        const set = this.eventListeners.get(msg.method);
        for (const cb of [...set]) cb(msg.params);
      }
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    if (this.info.type === 'page') {
      await this.send('Page.enable').catch(() => {});
      await this.send('Runtime.enable').catch(() => {});
    }
    return this;
  }

  /** Waits for a specific CDP event (e.g. `Page.loadEventFired`). */
  waitForEvent(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      let set = this.eventListeners.get(method);
      if (!set) {
        set = new Set();
        this.eventListeners.set(method, set);
      }
      const timer = setTimeout(() => {
        set.delete(onEvent);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for CDP event ${method}`));
      }, timeoutMs);
      const onEvent = (params) => {
        clearTimeout(timer);
        set.delete(onEvent);
        resolve(params);
      };
      set.add(onEvent);
    });
  }

  /** Sends a raw CDP command and awaits its JSON result. */
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an expression inside the target context and returns its serialized value. */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`CDP eval error: ${desc}`);
    }
    return res.result?.value;
  }

  /** Navigates the page target to `url` and waits for `Page.loadEventFired` + settle delay. */
  async navigate(url, settleMs = 350) {
    const loaded = this.info.type === 'page' ? this.waitForEvent('Page.loadEventFired', 20000) : Promise.resolve();
    await this.send('Page.navigate', { url });
    await loaded;
    if (settleMs > 0) await sleep(settleMs);
  }

  /** Polls until `predicateExpr` returns truthy or throws after `timeoutMs`. */
  async waitFor(predicateExpr, timeoutMs = 10000, stepMs = 150) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await this.eval(predicateExpr).catch(() => null);
      if (val) return val;
      await sleep(stepMs);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${predicateExpr}`);
  }

  /** Clicks the first element matching `selector` inside the page DOM. */
  async click(selector) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    assert.ok(ok, `Expected clickable element: ${selector}`);
  }

  /** Sets the viewport dimensions for responsive / scroll testing. */
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(150);
  }

  /** Captures a PNG screenshot into `dist/screenshots/` for visual regression inspection. */
  async screenshot(filename) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const out = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(out, buf);
    return out;
  }

  /** Closes the WebSocket session (does not close the underlying browser tab). */
  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

/** Builds an unpacked extension copy for automated CDP tests with WKND host permissions baked in. */
export function buildE2eExtension() {
  fs.rmSync(E2E_EXT_DIR, { recursive: true, force: true });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, ORBIT_BUILD_OUT: E2E_EXT_DIR },
  });
  const manifestPath = path.join(E2E_EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cloudHosts = ['dev', 'stage', 'prod'].flatMap((env) =>
    ['author', 'publish', 'preview'].map((tier) => `https://${env}-cloud-${tier}.com/*`),
  );
  manifest.host_permissions = [
    'http://localhost/*',
    'http://127.0.0.1/*',
    'https://*.wknd.com/*',
    'https://wknd.com/*',
    ...cloudHosts,
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return E2E_EXT_DIR;
}

/** Finds the Chrome executable path on disk. */
function findChromeBinary() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('No Chrome binary found for E2E testing. Install Chrome for Testing or Google Chrome.');
  }
  return found;
}

/** Builds the WKND AEM test configuration object matching the local/cloud/proxy setup. */
export function createWkndConfig(password) {
  const mappingsPath = path.join(ROOT, 'video', 'env', 'url-mappings.txt');
  const urlMappings = fs.existsSync(mappingsPath)
    ? fs.readFileSync(mappingsPath, 'utf8')
    : '/content/wknd/us/en = /\n/content/wknd/de/de = /de-de';
  const cloud = (env, cdn, extra = {}) => ({
    authorHost: `https://${env}-cloud-author.com`,
    publishHost: `https://${env}-cloud-publish.com`,
    previewHost: `https://${env}-cloud-preview.com`,
    dispatcherHost: `https://${cdn}`,
    authType: 'basic',
    dispatcherOmitHtml: true,
    publishUsesMappings: true,
    ...extra,
  });
  const sync = {
    persona: 'custom',
    environments: {
      local: { authorHost: 'http://localhost:4502', publishHost: 'http://localhost:4503', authType: 'basic' },
      dev: cloud('dev', 'wwwdev.wknd.com'),
      stage: cloud('stage', 'wwwstage.wknd.com'),
      prod: cloud('prod', 'www.wknd.com', { protected: true }),
    },
    envOrder: ['local', 'dev', 'stage', 'prod'],
    contentRoot: '/content/wknd',
    appName: 'wknd',
    urlMappings,
    profiles: {
      wknd: {
        label: 'WKND Travel',
        contentRoot: '/content/wknd',
        appName: 'wknd',
        matchDomains: ['wknd.com', 'wwwdev.wknd.com', 'dev-cloud-author.com', 'stage-cloud-author.com', 'prod-cloud-author.com'],
        urlMappings,
      },
    },
    activeProfile: 'wknd',
    optionsTheme: 'dark',
    showOnAuthor: true,
    showOnPublish: true,
    showOnDispatcher: true,
    enableDevMode: true,
    devToolsButtons: {
      jcr: true, overlays: true, highlight: true, inspect: true,
      tools: true, reload: true, delete: true, sync: true,
    },
    qaToolsButtons: { audit: false, cache: false, readiness: false },
    confirmDelete: true,
    confirmPublish: false,
    notifyOnActions: false,
    showLastModified: true,
    enableKeyboardShortcut: true,
    classicBar: false,
    summonOnLongPress: false,
    customizeToolbar: false,
  };
  const secrets = Object.fromEntries(
    ['local', 'dev', 'stage', 'prod'].map((env) => [env, { username: 'admin', password }]),
  );
  return { sync, secrets };
}

/**
 * Launches Chrome for Testing or connects to `ORBIT_CDP`, runs registered E2E suites,
 * prints structured pass/fail results, and cleans up spawned resources.
 *
 * @param {Array<{name:string, run:(ctx:object)=>Promise<void>}>} suites - Ordered E2E suites.
 * @param {{filter?:string, headless?:boolean}} [opts] - Execution options.
 * @returns {Promise<{passed:number, failed:number}>}
 */
export async function runE2eSuites(suites, opts = {}) {
  const adminPassword = process.env.ORBIT_ADMIN_PW || 'admin';
  const externalCdp = process.env.ORBIT_CDP || '';
  const baseUrl = externalCdp || `http://127.0.0.1:${DEFAULT_CDP_PORT}`;
  const headless = opts.headless ?? (process.env.ORBIT_E2E_HEADLESS !== '0');
  let chromeProc = null;

  if (!externalCdp) {
    buildE2eExtension();
    fs.rmSync(DEFAULT_PROFILE_DIR, { recursive: true, force: true });
    fs.mkdirSync(DEFAULT_PROFILE_DIR, { recursive: true });

    const proxyRules = ['*.wknd.com', '*-cloud-author.com', '*-cloud-publish.com', '*-cloud-preview.com']
      .map((h) => `MAP ${h} 127.0.0.1:8443`)
      .join(', ');

    const args = [
      ...(headless ? ['--headless=new'] : []),
      `--user-data-dir=${DEFAULT_PROFILE_DIR}`,
      `--remote-debugging-port=${DEFAULT_CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--remote-allow-origins=${baseUrl}`,
      '--ignore-certificate-errors',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      '--window-size=1440,900',
      `--load-extension=${E2E_EXT_DIR}`,
      `--host-resolver-rules=${proxyRules}`,
      'about:blank',
    ];
    chromeProc = spawn(findChromeBinary(), args, { stdio: 'ignore' });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${baseUrl}/json/version`);
        if (res.ok) break;
      } catch { /* waiting */ }
      await sleep(200);
    }
  }

  const listTargets = async () => (await fetch(`${baseUrl}/json/list`)).json();

  const findExtensionId = async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const list = await listTargets();
      const sw = list.find((t) => t.url.includes('/src/background/service-worker.js') || t.url.includes('/src/options/options.html'));
      if (sw) return new URL(sw.url).host;
      await sleep(200);
    }
    throw new Error('Could not discover AEM Orbit extension ID from CDP targets.');
  };

  const openTarget = async (url = 'about:blank') => {
    const info = await (await fetch(`${baseUrl}/json/new?about:blank`, { method: 'PUT' })).json();
    const target = await new CdpTarget(info, baseUrl).connect();
    if (url && url !== 'about:blank') {
      await target.navigate(url, 350);
    }
    return target;
  };

  const closeTarget = async (target) => {
    if (!target) return;
    target.close();
    await fetch(`${baseUrl}/json/close/${target.info.id}`, { method: 'PUT' }).catch(() => {});
  };

  let passed = 0;
  let failed = 0;

  try {
    const extensionId = await findExtensionId();
    // Keep one persistent extension page open so storage / chrome.tabs / runtime messaging are always reachable.
    const extControl = await openTarget(`chrome-extension://${extensionId}/src/options/options.html`);
    await extControl.waitFor('document.readyState === "complete" && !!chrome?.runtime?.sendMessage');

    const ctx = {
      ROOT,
      baseUrl,
      extensionId,
      adminPassword,
      assert,
      sleep,
      extControl,
      listTargets,
      openTarget,
      closeTarget,

      /** Sends a background message through the extension runtime cleanly. */
      async msg(action, payload = {}) {
        return extControl.eval(`new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: ${JSON.stringify(action)}, payload: ${JSON.stringify(payload)} }, (r) => resolve(r));
        })`);
      },

      /** Seeds deterministic WKND Local/Dev/Stage/Prod settings into extension storage. */
      async seedWknd(overrides = {}) {
        const { sync, secrets } = createWkndConfig(adminPassword);
        Object.assign(sync, overrides);
        await extControl.eval(`(async () => {
          await chrome.storage.sync.clear();
          await chrome.storage.local.clear();
          await chrome.storage.session?.clear?.();
          await chrome.storage.sync.set(${JSON.stringify(sync)});
          await chrome.storage.local.set({ secrets: ${JSON.stringify(secrets)} });
          await new Promise((r) => chrome.runtime.sendMessage({ action: 'SYNC_CONTENT_SCRIPTS' }, r));
          return true;
        })()`);
      },

      /** Opens a browser page and logs into AEM Author login screen if redirected. */
      async openAemPage(url, waitForToolbar = true) {
        const page = await openTarget(url);
        await page.waitFor('document.readyState === "complete"', 15000);
        const curUrl = await page.eval('location.href');
        if (/\/libs\/granite\/core\/content\/login/i.test(curUrl)) {
          await page.eval(`fetch('/libs/granite/core/content/login.html/j_security_check', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              _charset_: 'UTF-8',
              j_username: 'admin',
              j_password: ${JSON.stringify(adminPassword)},
              resource: '/',
            }),
          }).then((r) => r.ok)`);
          await page.navigate(url, 800);
          await page.waitFor('document.readyState === "complete" && !/\\/login/i.test(location.pathname)', 15000);
        }
        if (waitForToolbar) {
          await page.waitFor('!!document.getElementById("aem-sidekick-pro-root")', 12000);
        }
        return page;
      },

      /** Opens the extension Options page in a fresh tab. */
      async openOptions() {
        const t = await openTarget(`chrome-extension://${extensionId}/src/options/options.html`);
        await t.waitFor('document.readyState === "complete" && !!document.getElementById("personaGrid")', 10000);
        return t;
      },

      /** Opens the extension Popup bound to a specific AEM tab ID. */
      async openPopupForTab(tabId) {
        const t = await openTarget(`chrome-extension://${extensionId}/src/popup/popup.html?tabId=${tabId}`);
        await t.waitFor('document.getElementById("mainContent")?.style.display === "block" && document.getElementById("envBadgeLabel")?.textContent !== "—"', 10000);
        return t;
      },

      /** Finds Chrome tab ID for a navigated CDP target URL substring. */
      async findTabId(urlSubstr) {
        return extControl.eval(`new Promise((resolve) => {
          chrome.tabs.query({}, (tabs) => {
            const match = tabs.find((t) => (t.url || '').includes(${JSON.stringify(urlSubstr)}));
            resolve(match ? match.id : null);
          });
        })`);
      },
    };

    const selected = opts.filter
      ? suites.filter((s) => s.name.toLowerCase().includes(opts.filter.toLowerCase()))
      : suites;

    for (const suite of selected) {
      console.log(`\n▶ Suite: ${suite.name}`);
      const testFn = async (label, fn) => {
        const t0 = Date.now();
        try {
          await fn();
          passed++;
          console.log(`  ✔ ${label} (${Date.now() - t0}ms)`);
        } catch (err) {
          failed++;
          console.error(`  ✖ ${label} (${Date.now() - t0}ms)\n    ${err?.stack || err}`);
        }
      };
      await suite.run(ctx, testFn);
    }

    await closeTarget(extControl);
  } finally {
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
      try { fs.rmSync(DEFAULT_PROFILE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`════════════════════════════════════════════════════════════════`);
  return { passed, failed };
}
