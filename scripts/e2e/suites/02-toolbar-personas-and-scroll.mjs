/**
 * @file E2E Suite 02: In-Page Toolbar, Orb, Persona Switching, Command Palette & Scrollable Viewport Menus.
 * @module e2e/suites/02-toolbar-personas-and-scroll
 */

export default {
  name: '02 · Toolbar, Personas, Command Palette & Scrollable Viewport Windows',

  /** Tests toolbar rendering, persona updates, env switching, palette, and compact viewport scrolling. */
  async run(ctx, test) {
    const { assert, sleep } = ctx;
    await ctx.seedWknd({ persona: 'dev' });

    const page = await ctx.openAemPage('https://dev-cloud-author.com/editor.html/content/wknd/us/en.html', true);

    try {
      await test('Floating orb expands into bar on Dev Author and reflects Dev persona items', async () => {
        await page.waitFor('document.getElementById("asp-status-pill")?.textContent !== "—"', 10000);
        const before = await page.eval(`({
          hasOrbRoot: document.getElementById('aem-sidekick-pro-root').classList.contains('asp-root-orb'),
          envLabel: document.getElementById('asp-env-chip-label')?.textContent,
        })`);
        assert.equal(before.hasOrbRoot, true);
        assert.equal(before.envLabel, 'dev');

        await page.click('#asp-logo-btn');
        await sleep(350);
        const expanded = await page.eval(`({
          minimized: document.getElementById('asp-bar').classList.contains('asp-minimized'),
          hasJcr: document.getElementById('asp-jcr-btn')?.closest('#asp-center-cluster') !== null,
          hasAudit: document.getElementById('asp-audit-btn')?.closest('#asp-center-cluster') !== null,
          hasSync: document.getElementById('asp-sync-btn')?.closest('#asp-center-cluster') !== null,
        })`);
        assert.equal(expanded.minimized, false);
        assert.equal(expanded.hasJcr, true);
        assert.equal(expanded.hasAudit, true);
        assert.equal(expanded.hasSync, true);
        await page.screenshot('02-dev-author-expanded-toolbar.png');
      });

      await test('Live persona switching via More Menu updates toolbar buttons without reload', async () => {
        await page.click('#asp-more-btn');
        await page.waitFor('!!document.getElementById("asp-menu")', 3000);
        await page.eval(`(() => {
          const items = [...document.querySelectorAll('#asp-menu .asp-menu-item')];
          items.find((b) => b.textContent.includes('QA') && !b.textContent.includes('✓'))?.click();
        })()`);
        await page.waitFor('document.getElementById("asp-jcr-btn")?.closest("#asp-pool") !== null && document.getElementById("asp-cache-btn")?.closest("#asp-center-cluster") !== null', 5000);
        const qaButtons = await page.eval(`({
          jcrInPool: !!document.getElementById('asp-jcr-btn')?.closest('#asp-pool'),
          syncInPool: !!document.getElementById('asp-sync-btn')?.closest('#asp-pool'),
          publishInPool: !!document.getElementById('asp-publish-btn')?.closest('#asp-pool'),
          auditVisible: !!document.getElementById('asp-audit-btn')?.closest('#asp-center-cluster'),
          cacheVisible: !!document.getElementById('asp-cache-btn')?.closest('#asp-center-cluster'),
        })`);
        assert.equal(qaButtons.jcrInPool, true);
        assert.equal(qaButtons.syncInPool, true);
        assert.equal(qaButtons.auditVisible, true);
        assert.equal(qaButtons.cacheVisible, true);

        // Switch back to Developer persona via background API and confirm live update
        const sw = await ctx.msg('SET_PERSONA', { persona: 'dev' });
        assert.equal(sw.ok, true);
        await page.waitFor('!!document.getElementById("asp-jcr-btn")?.closest("#asp-center-cluster")', 5000);
      });

      await test('Long Locales list & Env Picker stay inside compact viewport with internal scrollbars', async () => {
        await page.setViewport(1280, 560);
        try {
          await page.click('#asp-locales-btn');
          await page.waitFor('document.querySelectorAll("#asp-menu .asp-menu-item").length >= 2', 8000);

          // Close menu cleanly, inject 25 synthetic hreflang links, then reopen to verify bounded scrollable container.
          await page.eval('document.body.click()');
          await page.waitFor('!document.getElementById("asp-menu")', 2000);
          await page.eval(`(() => {
            const doc = document.getElementById('ContentFrame')?.contentDocument || document;
            for (let i = 1; i <= 25; i++) {
              const link = doc.createElement('link');
              link.setAttribute('rel', 'alternate');
              link.setAttribute('hreflang', 'x-e2e-' + i);
              link.setAttribute('href', 'https://wwwdev.wknd.com/locale-' + i);
              doc.head.appendChild(link);
            }
          })()`);
          await page.click('#asp-locales-btn');
          await page.waitFor('document.querySelectorAll("#asp-menu .asp-menu-item").length >= 25', 8000);

          const geometry = await page.eval(`(() => {
            const menu = document.getElementById('asp-menu');
            const list = menu.querySelector('.asp-menu-items');
            const mr = menu.getBoundingClientRect();
            const overflowY = getComputedStyle(list).overflowY;
            return {
              top: mr.top,
              bottom: mr.bottom,
              innerH: window.innerHeight,
              itemCount: menu.querySelectorAll('.asp-menu-item').length,
              scrollH: list.scrollHeight,
              clientH: list.clientHeight,
              overflowY,
            };
          })()`);
          assert.ok(geometry.itemCount >= 25, `Expected >= 25 locale rows, got ${geometry.itemCount}`);
          assert.ok(geometry.top >= 0, `Menu clipped above top: ${geometry.top}`);
          assert.ok(geometry.bottom <= geometry.innerH, `Menu overflowed bottom (${geometry.bottom} > ${geometry.innerH})`);
          assert.ok(geometry.scrollH > geometry.clientH, `Expected scrollable overflow (${geometry.scrollH} <= ${geometry.clientH})`);
          assert.equal(geometry.overflowY, 'auto');
          await page.screenshot('03-locales-scrollable-viewport.png');
          await page.eval('document.body.click()');
        } finally {
          await page.setViewport(1440, 900);
        }
      });

      await test('Shift-clicking Env Picker re-targets tab actions cleanly and Command Palette filters commands', async () => {
        await page.click('#asp-env-chip');
        await page.waitFor('document.getElementById("asp-env-picker")?.style.display === "flex"', 3000);
        await page.eval(`(() => {
          const btn = document.querySelector('#asp-env-picker [data-env="stage"]');
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        })()`);
        await page.waitFor('document.getElementById("asp-env-chip-label")?.textContent === "stage"', 5000);

        await page.click('#asp-palette-btn');
        await page.waitFor('!!document.getElementById("asp-palette")', 3000);
        await page.eval(`(() => {
          const inp = document.querySelector('#asp-palette input');
          inp.value = 'audit';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        const paletteCount = await page.eval('document.querySelectorAll("#asp-palette .asp-menu-item").length');
        assert.ok(paletteCount >= 1);
        await page.eval('document.querySelector("#asp-palette input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      });
    } finally {
      await ctx.closeTarget(page);
    }
  },
};
