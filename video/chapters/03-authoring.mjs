// Chapter 3 - Authoring, replication & governance.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py   (reset the demo pages first, every time)
//      python3 video/scripts/detach.py /tmp/ch3.log node video/chapters/03-authoring.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import { openPopup } from '../lib/popup.mjs'
import * as T from '../lib/toolbar.mjs'

const B = '/content/wknd/us/en/orbit-demo/authoring'
const VIEW = '?wcmmode=disabled'
const dev = (name) => `${AUTHOR.dev}${B}/${name}.html${VIEW}`
const prod = (name) => `${AUTHOR.prod}${B}/${name}.html${VIEW}`

const log = (...a) => console.log(' ', ...a)
const p = (i) => `p${String(i).padStart(2, '0')}`
const DEV_BULK = Array.from({ length: 50 }, (_, i) => `${B}/bulk/${p(i + 1)}`)
const BAD = `${B}/bulk/does-not-exist`

async function togglePill(rec) { await rec.click('#asp-status-pill', 800); await sleep(1200) }

/** Open the Publish menu and choose an entry. */
async function publishMenu(rec, item) {
  await T.openMenu(rec, '#asp-publish-menu-btn')
  await sleep(900)
  await T.clickMenuItem(rec, item)
}

/** Click into the bulk list and paste (replacing whatever is there). */
async function pasteBulk(rec, lines) {
  await rec.click('#bulkInput', 600)
  await rec.tab.eval(`document.getElementById('bulkInput').select()`)
  await T.paste(rec, lines.join('\n'))
  await sleep(900)
}

await runChapter('03-authoring', {
  url: dev('publish-demo'),
  steps: (rec) => [
    // ---- quick publish / unpublish + pre-flight on a clean page --------------------------------
    { say: 'Chapter three: authoring, replication and governance. Everything here is one or two clicks from the toolbar, and every action asks before it does anything you cannot take back. Open the Publish menu.',
      do: async () => { await rec.title('Chapter 3 · <b>Authoring</b>, replication &amp; governance', 'Publish, pre-flight, preview, locks, trees, bulk, safe delete and Prod Guard'); await T.expand(rec); await T.openMenu(rec, '#asp-publish-menu-btn'); await sleep(2400) } },
    { say: 'Publish page sends this page to the Publish tier through the A E M replication servlet. First it runs a pre-flight check on everything the page uses, and when all of it is already live, the page simply goes out.',
      do: async () => { await T.clickMenuItem(rec, 'Publish page'); const t = await T.waitToolbarToast(rec, 'published'); log('publish ->', t); await sleep(2500) } },
    { say: 'The toast says so, and the status pill follows. Now Unpublish page takes it off the Publish tier again, with one click.',
      do: async () => { await publishMenu(rec, 'Unpublish page'); const t = await T.waitToolbarToast(rec, 'unpublished'); log('unpublish ->', t); await sleep(2800) } },

    // ---- preview tier ---------------------------------------------------------------------------
    { say: 'On a Cloud environment you can also publish to the Preview tier only. This is the same replication call, aimed at the preview agent, so authors can check a page before it goes to production.',
      do: async () => { await rec.goto(dev('preview-demo'), 3800); await T.expand(rec); await T.openMenu(rec, '#asp-publish-menu-btn'); await sleep(1800); await T.clickMenuItem(rec, 'Publish to Preview'); const t = await T.waitToolbarToast(rec, 'Preview'); log('preview ->', t); await sleep(2500) } },
    { say: 'The page details panel now shows the Preview tier as published, while the page itself is still a draft on the Publish tier.',
      do: async () => { await togglePill(rec); await sleep(5200); await togglePill(rec) } },

    // ---- pre-flight with a problem --------------------------------------------------------------
    { say: 'Now the pre-flight check at work. This page uses an image that has never been published. Choose Publish page.',
      do: async () => { await rec.goto(dev('preflight-demo'), 3800); await T.expand(rec); await publishMenu(rec, 'Publish page'); const d = await T.waitDialog(rec); log('preflight ->', d.title, '|', d.msg.replace(/\n+/g, ' ').slice(0, 150)); await sleep(1500) } },
    { say: 'Before anything is sent, Orbit lists every referenced item that is not up to date on publish, so a live page can never point to a missing image. You can publish anyway, or cancel and publish the asset first. I cancel.',
      do: async () => { await sleep(5200); await T.dialogCancel(rec); await T.dialogGone(rec); const t = await T.waitToolbarToast(rec, 'cancelled'); log('preflight cancel ->', t); await sleep(1800) } },

    // ---- lock / unlock --------------------------------------------------------------------------
    { say: 'Page locks work the same way. From the command palette, Lock page takes the lock through the W C M command servlet.',
      do: async () => { await rec.goto(dev('lock-demo'), 3800); await T.expand(rec); await rec.key('k', { code: 'KeyK', modifiers: T.META }); await sleep(900); await rec.type('lock', 90); await sleep(900); await rec.key('Enter')
        const t = await T.waitToolbarToast(rec, 'locked'); log('lock ->', t); await sleep(1800) } },
    { say: 'The lock shows at once: a padlock on the status pill, and the owner in the details panel. Another author who opens this page sees it, too.',
      do: async () => { await rec.hover('#asp-status-pill', 900); await sleep(1200); await togglePill(rec); await sleep(4200); await togglePill(rec) } },
    { say: 'And Unlock page takes it away again.',
      do: async () => { await rec.key('k', { code: 'KeyK', modifiers: T.META }); await sleep(800); await rec.type('unlock', 90); await sleep(900); await rec.key('Enter'); const t = await T.waitToolbarToast(rec, 'unlocked'); log('unlock ->', t); await sleep(2800) } },

    // ---- tree publish + dry run (popup) ---------------------------------------------------------
    { say: 'Publishing a whole section is a job for the popup. Here is a small tree: a parent, three children, and one grandchild. Tree Publish does not just start. It does a dry run first.',
      do: async () => { const u = dev('tree-demo'); await rec.goto(u, 3500); globalThis.__pop = await openPopup(rec); await sleep(2500); await rec.click('#treeActivateBtn', 900) } },
    { say: 'The dry run counts the pages and lists them before you confirm: five pages will go live. One more page was unpublished on purpose, so it is skipped and counted separately. Nothing has been sent yet.',
      do: async () => { const d = await T.waitDialog(rec); log('tree dry run ->', d.msg.replace(/\n+/g, ' | ').slice(0, 260)); await sleep(9000) } },
    { say: 'Confirm, and the pages are replicated in batches.',
      do: async () => { await T.dialogConfirm(rec); await T.dialogGone(rec); const t = await T.waitPopupToast(rec, 'Published'); log('tree publish ->', t); await sleep(3000) } },
    { say: 'Tree Unpublish is the mirror image, with its own dry run and its own confirmation.',
      do: async () => { await rec.click('#treeDeactivateBtn', 900); const d = await T.waitDialog(rec); log('tree unpublish dry run ->', d.msg.replace(/\n+/g, ' | ').slice(0, 160)); await sleep(5200); await T.dialogConfirm(rec); await T.dialogGone(rec); const t = await T.waitPopupToast(rec, 'Unpublished'); log('tree unpublish ->', t); await sleep(2600) } },

    // ---- bulk replication (popup) ---------------------------------------------------------------
    { say: 'For pages that are not in one tree, use Bulk Publish. Paste up to two hundred paths or page U R L s, one per line, in any mix.',
      do: async () => { await globalThis.__pop.close(); const u = dev('bulk/p01'); await rec.goto(u, 3500); globalThis.__pop = await openPopup(rec); await sleep(2200)
        await rec.click('#bulkBtn', 800); await sleep(900); await pasteBulk(rec, DEV_BULK); log('bulk count ->', await rec.tab.eval(`document.getElementById('bulkCount').textContent`)); await sleep(1800) } },
    { say: 'Dry Run checks every page first, and shows its status: here all fifty are drafts.',
      do: async () => { await rec.click('#bulkDryRun', 800); await rec.waitFor('#bulkDryRunResults .list-row', 20000); log('bulk dry run rows ->', await rec.tab.eval(`document.querySelectorAll('#bulkDryRunResults .list-row').length`)); await sleep(4200) } },
    { say: 'Now a typo sneaks in: one path that does not exist, at the top of the list. Orbit sends the pages in batches of fifty. A E M refuses the batch that holds the bad path, and Orbit tells you exactly how many pages made it.',
      do: async () => { await pasteBulk(rec, [BAD, ...DEV_BULK]); await rec.click('#bulkPublish', 800); const d = await T.waitDialog(rec); log('bulk confirm ->', d.title, '|', d.msg); await sleep(2600); await T.dialogConfirm(rec); await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'published', 30000); log('bulk failure ->', t); await sleep(5200) } },
    { say: 'The page that did go through is not repeated. The list now holds only the ones that failed, so a retry never publishes anything twice. I take the bad path out, and publish the rest.',
      do: async () => { log('failed list lines ->', await rec.tab.eval(`document.getElementById('bulkInput').value.split('\\n').length`)); await sleep(2200)
        const keep = (await rec.tab.eval(`document.getElementById('bulkInput').value`)).split('\n').filter((l) => l && l !== BAD)
        await pasteBulk(rec, keep); await rec.click('#bulkPublish', 800); await T.waitDialog(rec); await sleep(1500); await T.dialogConfirm(rec); await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Published', 30000); log('bulk retry ->', t); await sleep(3200) } },

    // ---- safe delete ----------------------------------------------------------------------------
    { say: 'Delete is safe by design. It runs through the same W C M command servlet as the Sites console, with force switched off, so A E M itself protects pages that others still use. This page is linked from another page.',
      do: async () => { await globalThis.__pop.close(); await rec.goto(dev('delete-target'), 3800); await T.expand(rec); await T.openMenu(rec, '#asp-more-btn'); await sleep(1500); await T.clickMenuItem(rec, 'Delete page'); const d = await T.waitDialog(rec); log('delete confirm ->', d.title, '|', d.msg); await sleep(3200) } },
    { say: 'After the confirmation, A E M says no: the page is referenced by other content, so it stays exactly where it is.',
      do: async () => { await T.dialogConfirm(rec); await T.dialogGone(rec); const t = await T.waitToolbarToast(rec, 'blocked'); log('delete blocked ->', t); await sleep(4200) } },
    { say: 'A page nothing refers to can be deleted. Same menu, same confirmation, and this time it works.',
      do: async () => { await rec.goto(dev('delete-free'), 3800); await T.expand(rec); await T.openMenu(rec, '#asp-more-btn'); await sleep(1200); await T.clickMenuItem(rec, 'Delete page'); await T.waitDialog(rec); await sleep(2200); await T.dialogConfirm(rec); await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'deleted'); log('delete ->', t); await sleep(3600) } },

    // ---- Prod Guard -----------------------------------------------------------------------------
    { say: 'Last, Prod Guard. Production is marked as a protected environment, so you see a lock on the environment chip, and a red border around the toolbar. Publishing here must be confirmed by typing.',
      do: async () => { await rec.goto(prod('guard-demo'), 4200); await T.expand(rec); await rec.hover('#asp-env-chip', 900); await sleep(2200); await publishMenu(rec, 'Publish page'); const d = await T.waitDialog(rec); log('prod guard ->', d.title, '|', d.label, '| disabled:', d.disabled); await sleep(2500) } },
    { say: 'The Confirm button stays disabled until the page name is typed exactly. A partial name does nothing.',
      do: async () => { await rec.click('.asp-dlg-input', 700); await rec.type('guard', 110); await sleep(1200); log('partial ->', JSON.stringify(await T.dialogState(rec))); await sleep(1500) } },
    { say: 'Only the full name unlocks it. Now the page is published to Prod.',
      do: async () => { await rec.type('-demo', 110); await sleep(1200); log('full ->', JSON.stringify(await T.dialogState(rec))); await T.dialogConfirm(rec); await T.dialogGone(rec); const t = await T.waitToolbarToast(rec, 'published'); log('prod publish ->', t); await sleep(3200) } },
    { say: 'The same guard covers delete and tree publish, and for bulk operations you must type the exact number of pages. Three pages, so I type three.',
      do: async () => { await rec.untitle(); const u = prod('bulk/p01'); await rec.goto(u, 3800); globalThis.__pop = await openPopup(rec); await sleep(2000)
        await rec.click('#bulkBtn', 800); await sleep(800); await pasteBulk(rec, [`${B}/bulk/p01`, `${B}/bulk/p02`, `${B}/bulk/p03`]); await rec.click('#bulkPublish', 800)
        const d = await T.waitDialog(rec); log('prod bulk ->', d.title, '|', d.label, '| disabled:', d.disabled); await sleep(2600)
        await rec.click('.asp-dlg-input', 700); await rec.type('3', 120); await sleep(1400); log('typed ->', JSON.stringify(await T.dialogState(rec))); await T.dialogConfirm(rec); await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Published', 30000); log('prod bulk publish ->', t); await sleep(3200) } },
    { say: 'That is the whole authoring loop: publish, check, preview, lock, publish in bulk, delete safely, and keep production guarded.',
      do: async () => { await globalThis.__pop.close(); await rec.moveTo(1250, 520, 800) } },
  ],
})
process.exit(process.exitCode || 0)
