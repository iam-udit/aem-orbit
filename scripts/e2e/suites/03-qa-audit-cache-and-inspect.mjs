/**
 * @file E2E Suite 03: QA SEO/A11y Audit, CDN Cache Headers & Component/DAM Inspector.
 * @module e2e/suites/03-qa-audit-cache-and-inspect
 */

export default {
  name: '03 · QA SEO Audit, CDN Cache Headers & Component/DAM Inspection',

  /** Verifies SEO audit, Dispatcher edge cache headers, Component inspector, and DAM asset cards. */
  async run(ctx, test) {
    const { assert } = ctx;
    await ctx.seedWknd({ persona: 'dev' });

    const page = await ctx.openAemPage('https://wwwdev.wknd.com/', true);

    try {
      await test('Toolbar injects cleanly on Dispatcher host (wwwdev.wknd.com) and runs Cache Headers check', async () => {
        await page.click('#asp-logo-btn');
        await page.waitFor('!document.getElementById("asp-bar").classList.contains("asp-minimized")', 3000);
        await page.click('#asp-cache-btn');
        await page.waitFor('document.querySelectorAll("#asp-cache-panel .asp-cc-row").length >= 2', 8000);
        const cacheInfo = await page.eval(`({
          hints: [...document.querySelectorAll('#asp-cache-panel .asp-cc-hint')].map((x) => x.textContent),
          keys: [...document.querySelectorAll('#asp-cache-panel .asp-cc-key')].map((x) => x.textContent.toLowerCase()),
        })`);
        assert.ok(cacheInfo.hints.some((h) => h.includes('HTTP 200')), `Expected HTTP 200 hint: ${JSON.stringify(cacheInfo)}`);
        assert.ok(cacheInfo.keys.includes('cache-control') || cacheInfo.keys.includes('x-cache') || cacheInfo.keys.includes('via'),
          `Expected CDN cache headers: ${JSON.stringify(cacheInfo.keys)}`);
        await page.screenshot('04-dispatcher-cache-headers.png');
        await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      });

      await test('SEO & Accessibility Audit evaluates live WKND page and fits inside viewport', async () => {
        await page.click('#asp-audit-btn');
        await page.waitFor('!!document.querySelector("#asp-audit-panel .asp-audit-score")', 12000);
        const audit = await page.eval(`(() => {
          const panel = document.getElementById('asp-audit-panel');
          const score = panel.querySelector('.asp-audit-score')?.textContent || '';
          const rows = panel.querySelectorAll('.asp-audit-row').length;
          const hasButtons = panel.querySelectorAll('.asp-audit-actions button').length === 2;
          const rect = panel.getBoundingClientRect();
          return { score, rows, hasButtons, top: rect.top, bottom: rect.bottom, vh: window.innerHeight };
        })()`);
        assert.match(audit.score, /^Score \d+\/100$/);
        assert.ok(audit.rows >= 6, `Expected >=6 audit checks, got ${audit.rows}`);
        assert.equal(audit.hasButtons, true);
        assert.ok(audit.top >= 0 && audit.bottom <= audit.vh);
        await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      });

      await test('Component Inspector & DAM Asset Card inspect live WKND image/component', async () => {
        await page.click('#asp-inspect-btn');
        await page.eval(`(() => {
          const target = document.querySelector('[data-cmp-is]');
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        })()`);
        await page.waitFor('!!document.getElementById("asp-component-card")', 6000);
        const cardText = await page.eval('document.getElementById("asp-component-card").textContent');
        assert.ok(cardText.includes('Resource type') || cardText.includes('Component'), `Unexpected card text: ${cardText}`);
        await page.eval('document.getElementById("asp-component-card")?.remove()');

        await page.click('#asp-dam-btn');
        await page.eval(`(() => {
          const img = document.querySelector('[data-cmp-filereference^="/content/dam/"], img[src*="/content/dam/"], img');
          img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        })()`);
        await page.waitFor('!!document.getElementById("asp-asset-card")', 6000);
        const damText = await page.eval('document.getElementById("asp-asset-card").textContent');
        assert.ok(damText.includes('DAM Asset') || damText.includes('Content Fragment'), `Expected DAM card, got: ${damText}`);
        await page.eval('document.getElementById("asp-asset-card")?.remove()');
      });

      await test('Stage DE-DE CDN (/content/wknd/de/de), Dev Preview, and Local Author detect accurate tiers & paths', async () => {
        const stageDe = await ctx.openAemPage('https://wwwstage.wknd.com/de-de', true);
        try {
          await stageDe.waitFor('document.getElementById("asp-env-chip-label")?.textContent === "stage"', 5000);
          const stInfo = await stageDe.eval(`({
            env: document.getElementById('asp-env-chip-label')?.textContent,
            tier: document.getElementById('asp-tier-btn')?.textContent?.trim(),
          })`);
          assert.equal(stInfo.env, 'stage');
          assert.ok(/live/i.test(stInfo.tier || ''), `Expected Live tier on wwwstage.wknd.com, got: ${stInfo.tier}`);
        } finally {
          await ctx.closeTarget(stageDe);
        }

        const devPrev = await ctx.openAemPage('https://dev-cloud-preview.com/content/wknd/us/en.html', true);
        try {
          await devPrev.waitFor('document.getElementById("asp-env-chip-label")?.textContent === "dev"', 5000);
          const pvTier = await devPrev.eval('document.getElementById("asp-tier-btn")?.textContent?.trim()');
          assert.ok(/preview/i.test(pvTier || ''), `Expected Preview tier, got: ${pvTier}`);
        } finally {
          await ctx.closeTarget(devPrev);
        }

        const localAuth = await ctx.openAemPage('http://localhost:4502/content/wknd/us/en.html?wcmmode=disabled', true);
        try {
          await localAuth.waitFor('document.getElementById("asp-env-chip-label")?.textContent === "local"', 5000);
          const lcEnv = await localAuth.eval('document.getElementById("asp-env-chip-label")?.textContent');
          assert.equal(lcEnv, 'local');
        } finally {
          await ctx.closeTarget(localAuth);
        }
      });
    } finally {
      await ctx.closeTarget(page);
    }
  },
};
