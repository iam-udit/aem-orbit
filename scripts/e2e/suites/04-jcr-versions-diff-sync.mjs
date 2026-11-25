/**
 * @file E2E Suite 04: JCR Tree Inspector, Multi-Env Diff, Versions, Lock & Content Sync/Undo.
 * @module e2e/suites/04-jcr-versions-diff-sync
 */

export default {
  name: '04 · JCR Inspector, Compare/Diff, Versions, Lock & Reversible Sync',

  /** Exercises JCR inspection, cross-env compare/diff, versioning, locking, and reversible sync. */
  async run(ctx, test) {
    const { assert } = ctx;
    await ctx.seedWknd({ persona: 'dev' });

    const TARGET_PATH = '/content/wknd/us/en/about-us';
    const page = await ctx.openAemPage(`https://dev-cloud-author.com${TARGET_PATH}.html?wcmmode=disabled`, true);

    try {
      await test('JCR Inspector loads live repository tree, supports Expand/Collapse/Filter & Esc closes it', async () => {
        await page.click('#asp-logo-btn');
        await page.waitFor('!document.getElementById("asp-bar").classList.contains("asp-minimized")', 3000);
        await page.click('#asp-jcr-btn');
        await page.waitFor('document.querySelectorAll("#asp-inspector-body .asp-tree-prop").length >= 3', 10000);

        await page.click('#asp-inspector-expand');
        const expandedOpen = await page.eval('[...document.querySelectorAll("#asp-inspector-body details")].every((d) => d.open)');
        assert.equal(expandedOpen, true);

        await page.click('#asp-inspector-collapse');
        await page.eval(`(() => {
          const s = document.getElementById('asp-inspector-search');
          s.value = 'sling:resourceType';
          s.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        const filtered = await page.eval('document.querySelectorAll("#asp-inspector-body .asp-tree-prop").length >= 1');
        assert.equal(filtered, true);
        await page.screenshot('05-jcr-inspector-tree.png');

        await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
        assert.equal(await page.eval('document.getElementById("asp-inspector").style.display === "none"'), true);
      });

      await test('Compare Environments & Diff inspect live WKND page across Local, Dev, Stage, and Prod', async () => {
        const cmp = await ctx.msg('COMPARE_ENVS', { jcrPath: TARGET_PATH });
        assert.equal(cmp.ok, true);
        assert.ok(cmp.results.length >= 4, `Expected >=4 env comparisons, got ${cmp.results.length}`);
        assert.ok(cmp.results.every((r) => r.ok && r.exists), `Expected all envs reachable: ${JSON.stringify(cmp.results)}`);

        const diff = await ctx.msg('DIFF_ENVS', { env: 'dev', otherEnv: 'stage', jcrPath: TARGET_PATH });
        assert.equal(diff.ok, true);
        assert.equal(diff.baseExists, true);
        assert.equal(diff.otherExists, true);
      });

      await test('Create Version, Lock/Unlock Page & Tree Dry Run work safely without lingering mutations', async () => {
        const ver = await ctx.msg('CREATE_VERSION', { env: 'local', jcrPath: TARGET_PATH, label: `e2e-${Date.now()}` });
        assert.equal(ver.ok, true, `Create version failed: ${ver.error}`);

        const lock = await ctx.msg('LOCK_PAGE', { env: 'local', jcrPath: TARGET_PATH });
        assert.equal(lock.ok, true, `Lock page failed: ${lock.error}`);
        const unlock = await ctx.msg('UNLOCK_PAGE', { env: 'local', jcrPath: TARGET_PATH });
        assert.equal(unlock.ok, true, `Unlock page failed: ${unlock.error}`);

        const treePub = await ctx.msg('PREVIEW_TREE_ACTIVATE', { env: 'dev', jcrPath: TARGET_PATH });
        assert.equal(treePub.ok, true);
        assert.ok(treePub.count >= 1);

        const treeDeact = await ctx.msg('PREVIEW_TREE_DEACTIVATE', { env: 'dev', jcrPath: TARGET_PATH });
        assert.equal(treeDeact.ok, true);
        assert.equal(typeof treeDeact.skipped, 'number');
      });

      await test('Content Sync (Stage → Local) and Undo Sync roundtrip cleanly on live AEM', async () => {
        const plan = await ctx.msg('GET_SYNC_PLAN', { env: 'local', sourceEnv: 'stage', jcrPath: TARGET_PATH });
        assert.equal(plan.ok, true);
        const synced = await ctx.msg('SYNC_CONTENT_PAGE', { env: 'local', sourceEnv: 'stage', jcrPath: TARGET_PATH, createMissing: !plan.exists });
        assert.equal(synced.ok, true, `Sync failed: ${synced.error}`);
        const undone = await ctx.msg('UNDO_SYNC', { env: 'local', jcrPath: TARGET_PATH });
        assert.equal(undone.ok, true, `Undo sync failed: ${undone.error}`);
      });
    } finally {
      await ctx.closeTarget(page);
    }
  },
};
