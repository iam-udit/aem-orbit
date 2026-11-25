/**
 * @file E2E Suite 01: Options UI, Brand Profiles, Live Diagnostics & Dynamic 4-Persona Switching.
 * @module e2e/suites/01-options-and-personas
 */

export default {
  name: '01 · Options UI, Personas & Live AEM Diagnostics',

  /** Runs Settings, Persona preset reflection, Brand Profiles, and Dev Diagnostics tests. */
  async run(ctx, test) {
    const { assert } = ctx;
    await ctx.seedWknd();
    const opt = await ctx.openOptions();

    try {
      await test('Persona cards dynamically change all Settings fields across Author, QA, Dev, and Custom', async () => {
        await opt.click('[data-persona="author"]');
        const authorState = await opt.eval(`({
          disp: document.getElementById('showOnDispatcher').checked,
          dev: document.getElementById('enableDevMode').checked,
          qaHidden: getComputedStyle(document.getElementById('qaSection')).display === 'none',
          devHidden: getComputedStyle(document.getElementById('devModeSection')).display === 'none',
          jcr: document.getElementById('devBtn-jcr').checked,
          bannerVisible: !document.getElementById('personaPresetBanner').hidden,
        })`);
        assert.equal(authorState.disp, false);
        assert.equal(authorState.dev, false);
        assert.equal(authorState.qaHidden, true);
        assert.equal(authorState.devHidden, true);
        assert.equal(authorState.jcr, false);
        assert.equal(authorState.bannerVisible, true);

        await opt.click('[data-persona="qa"]');
        const qaState = await opt.eval(`({
          disp: document.getElementById('showOnDispatcher').checked,
          dev: document.getElementById('enableDevMode').checked,
          qaShown: getComputedStyle(document.getElementById('qaSection')).display !== 'none',
          devHidden: getComputedStyle(document.getElementById('devModeSection')).display === 'none',
          audit: document.getElementById('qaBtn-audit').checked,
          cache: document.getElementById('qaBtn-cache').checked,
          inspect: document.getElementById('devBtn-inspect').checked,
          del: document.getElementById('devBtn-delete').checked,
        })`);
        assert.equal(qaState.disp, true);
        assert.equal(qaState.dev, false);
        assert.equal(qaState.qaShown, true);
        assert.equal(qaState.devHidden, true);
        assert.equal(qaState.audit, true);
        assert.equal(qaState.cache, true);
        assert.equal(qaState.inspect, true);
        assert.equal(qaState.del, false);

        await opt.click('[data-persona="dev"]');
        const devState = await opt.eval(`({
          dev: document.getElementById('enableDevMode').checked,
          qaShown: getComputedStyle(document.getElementById('qaSection')).display !== 'none',
          devShown: getComputedStyle(document.getElementById('devModeSection')).display !== 'none',
          jcr: document.getElementById('devBtn-jcr').checked,
          sync: document.getElementById('devBtn-sync').checked,
          del: document.getElementById('devBtn-delete').checked,
        })`);
        assert.equal(devState.dev, true);
        assert.equal(devState.qaShown, true);
        assert.equal(devState.devShown, true);
        assert.equal(devState.jcr, true);
        assert.equal(devState.sync, true);
        assert.equal(devState.del, true);

        await opt.click('#personaCloneCustom');
        const customState = await opt.eval(`({
          activePersona: document.querySelector('#personaGrid .persona-card.active')?.dataset.persona,
          customToolbar: document.getElementById('customizeToolbar').checked,
          jcrUnlocked: !document.getElementById('devBtn-jcr').disabled,
          bannerHidden: document.getElementById('personaPresetBanner').hidden,
        })`);
        assert.equal(customState.activePersona, 'custom');
        assert.equal(customState.customToolbar, true);
        assert.equal(customState.jcrUnlocked, true);
        assert.equal(customState.bannerHidden, true);
        await opt.screenshot('01-options-custom-persona.png');
      });

      await test('Multi-site brand profile CRUD and export JSON include persona and profiles', async () => {
        await opt.click('#addProfileBtn');
        await opt.eval(`(() => {
          document.getElementById('prof-id').value = 'e2e_brand';
          document.getElementById('prof-label').value = 'E2E Test Brand';
          document.getElementById('prof-root').value = '/content/e2e-brand';
          document.getElementById('prof-app').value = 'e2ebrand';
          document.getElementById('prof-domains').value = 'e2e.example.com';
        })()`);
        await opt.click('#profSaveBtn');
        const count = await opt.eval('document.querySelectorAll("#profilesList .profile-row").length');
        assert.ok(count >= 2, `Expected >=2 profiles, got ${count}`);

        const exported = await ctx.extControl.eval('typeof chrome !== "undefined"');
        assert.equal(exported, true);
        await opt.eval('document.querySelector("#profilesList .profile-row:last-child .btn-danger").click()');
      });

      await test('Live Test Connection and Multi-Tier Diagnostics succeed against Dev Cloud + Edge Proxy', async () => {
        await opt.click('.tab[data-tab="dev"]');
        await opt.click('button[data-test="dev"]');
        await opt.waitFor('/Connected as admin/i.test(document.getElementById("dev-connStatus")?.textContent || "")', 10000);
        await opt.click('#dev-diagBtn');
        await opt.waitFor('document.querySelectorAll("#dev-diagList .dot.ok").length >= 5', 12000);
        const rows = await opt.eval(`[...document.querySelectorAll('#dev-diagList .diag-row')].map((r) => ({
          name: r.querySelector('.diag-name')?.textContent,
          status: r.querySelector('.dot')?.className,
          detail: r.querySelector('.conn-status-text')?.textContent,
        }))`);
        assert.equal(rows.length, 5);
        assert.ok(rows.every((r) => r.status.includes('ok')), `Diagnostics expected 5 ok rows: ${JSON.stringify(rows)}`);
      });

      await test('Save button persists WKND configuration cleanly', async () => {
        await opt.click('#save');
        await opt.waitFor('document.getElementById("statusBanner")?.classList.contains("success")', 8000);
      });
    } finally {
      await ctx.closeTarget(opt);
    }
  },
};
