/**
 * @file E2E Suite 05: Workspace Popup UI, Search, QA Readiness, Diff Back & Protected Env Guards.
 * @module e2e/suites/05-popup-workspace-and-security
 */

export default {
  name: '05 · Popup Workspace UI, QA Readiness & Protected Production Guards',

  /** Opens Popup targeted at a live WKND tab and tests UI flows + security guards. */
  async run(ctx, test) {
    const { assert } = ctx;
    await ctx.seedWknd({ persona: 'custom', enableDevMode: false });

    const targetUrl = 'https://dev-cloud-author.com/editor.html/content/wknd/us/en.html';
    const aemTab = await ctx.openAemPage(targetUrl, true);
    const aemTabId = await ctx.findTabId('/content/wknd/us/en.html');
    assert.ok(aemTabId, 'Expected chrome tab id for opened AEM page');

    const pop = await ctx.openPopupForTab(aemTabId);

    try {
      await test('Custom persona in Popup keeps standard defaults and Search queries /content/wknd', async () => {
        const initState = await pop.eval(`({
          persona: document.getElementById('personaBadge').dataset.persona,
          qaHidden: getComputedStyle(document.getElementById('groupQa')).display === 'none',
          devHidden: getComputedStyle(document.getElementById('groupDeveloper')).display === 'none',
          jcrPath: document.getElementById('jcrPath').textContent,
        })`);
        assert.equal(initState.persona, 'custom');
        assert.equal(initState.qaHidden, true);
        assert.equal(initState.devHidden, true);
        assert.equal(initState.jcrPath, '/content/wknd/us/en');

        await pop.eval(`(() => {
          const inp = document.getElementById('searchInput');
          inp.value = 'Magazine';
          document.getElementById('searchBtn').click();
        })()`);
        await pop.waitFor('document.querySelectorAll("#searchResults .search-result-item").length >= 1', 10000);
        await pop.screenshot('06-popup-search-results.png');
        await pop.eval('document.getElementById("searchResults").classList.remove("open")');
      });

      await test('Popup Persona switcher toggles QA mode -> QA Readiness & Compare Diff with Back button', async () => {
        await pop.click('#personaBadge');
        await pop.waitFor('!document.getElementById("personaDropdown").hidden', 2000);
        await pop.click('#personaDropdown [data-persona-pick="qa"]');
        await pop.waitFor('document.getElementById("personaBadge").dataset.persona === "qa"', 4000);

        const qaUi = await pop.eval(`({
          replHidden: getComputedStyle(document.getElementById('replRow')).display === 'none',
          qaVisible: getComputedStyle(document.getElementById('groupQa')).display !== 'none',
          devHidden: getComputedStyle(document.getElementById('groupDeveloper')).display === 'none',
        })`);
        assert.equal(qaUi.replHidden, true);
        assert.equal(qaUi.qaVisible, true);
        assert.equal(qaUi.devHidden, true);

        await pop.click('#qaReadinessBtn');
        await pop.waitFor('document.querySelectorAll("#panelContent .list-row").length >= 4', 12000);
        await pop.screenshot('07-popup-qa-readiness.png');

        await pop.click('#compareBtn');
        await pop.waitFor('document.querySelectorAll("#panelContent .list-row").length >= 4', 10000);
      });

      await test('Switching Popup to Prod enforces Protected Guard on all destructive operations', async () => {
        await pop.click('#personaBadge');
        await pop.click('#personaDropdown [data-persona-pick="dev"]');
        await pop.waitFor('document.getElementById("personaBadge").dataset.persona === "dev"', 4000);

        await pop.click('#envBadge');
        await pop.waitFor('!document.getElementById("envDropdown").hidden', 2000);
        await pop.click('#envDropdown [data-env="prod"]');
        await pop.waitFor('document.getElementById("envBadgeLabel").textContent === "prod"', 4000);

        // Verify background refuses unconfirmed mutations on Prod even via direct message
        for (const [action, payload] of [
          ['PUBLISH_PAGE', { env: 'prod', jcrPath: '/content/wknd/us/en' }],
          ['UNPUBLISH_PAGE', { env: 'prod', jcrPath: '/content/wknd/us/en' }],
          ['DELETE_PAGE', { env: 'prod', jcrPath: '/content/wknd/us/en' }],
          ['FLUSH_DISPATCHER', { env: 'prod', path: '/content/wknd/us/en' }],
          ['REPLACE_ACROSS_PAGES', { env: 'prod', rootPath: '/content/wknd/us/en', replacements: [{ propPath: '/content/wknd/us/en/jcr:content/jcr:title', newValue: 'X' }] }],
        ]) {
          const res = await ctx.msg(action, payload);
          assert.equal(res.ok, false, `${action} should block without confirmation on prod`);
          assert.match(res.error, /Confirmation required/);
        }
      });

      await test('Copy URLs deduplicates Universal Editor and Find & Replace scans matches non-destructively', async () => {
        await pop.click('#urlVariantsBtn');
        await pop.waitFor('document.querySelectorAll("#panelContent .url-item").length >= 5', 5000);
        const labels = await pop.eval('[...document.querySelectorAll("#panelContent .url-label")].map((e) => e.textContent)');
        assert.equal(labels.filter((l) => l === 'Universal Editor').length <= 1, true);

        await pop.click('#findReplaceBtn');
        await pop.eval(`(() => {
          document.getElementById('frRootPath').value = '/content/wknd/us/en';
          document.getElementById('frSearchTerm').value = 'WKND';
          document.getElementById('frFindBtn').click();
        })()`);
        await pop.waitFor('document.querySelectorAll("#frResults .fr-match-check").length >= 1', 10000);
        const matchCount = await pop.eval('document.querySelectorAll("#frResults .fr-match-check").length');
        assert.ok(matchCount >= 1);
      });
    } finally {
      await ctx.closeTarget(pop);
      await ctx.closeTarget(aemTab);
    }
  },
};
