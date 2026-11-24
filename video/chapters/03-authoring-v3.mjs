// Chapter 3 (v3) - Enhanced Authoring, Replication & Governance with Christopher Neural voiceover and jointed acronyms.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/03-authoring-v3.mjs
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

async function togglePill(rec) {
  await rec.click('#asp-status-pill', 800)
  await sleep(1200)
}

/** Open the Publish menu and choose an entry. */
async function publishMenu(rec, item) {
  await T.openMenu(rec, '#asp-publish-menu-btn')
  await sleep(900)
  await T.clickMenuItem(rec, item)
}

/** Click into the bulk list and paste (replacing whatever is there). */
async function pasteBulk(rec, lines) {
  await rec.tab.eval(`(() => {
    const el = document.getElementById('bulkInput')
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })()`)
  await sleep(250)
  await rec.click('#bulkInput', 600)
  await rec.tab.eval(`document.getElementById('bulkInput').select()`)
  await T.paste(rec, lines.join('\n'))
  await sleep(900)
}

await runChapter('03-authoring-v3', {
  url: dev('publish-demo'),
  steps: (rec) => [
    // ---- quick publish / unpublish + pre-flight on a clean page --------------------------------
    {
      say: 'Welcome to Chapter 3: authoring, replication, and governance. Everything here is one or two clicks from the toolbar, and every action asks before it does anything you cannot take back. Open the Publish menu.',
      do: async () => {
        await rec.title('Chapter 3 · <b>Authoring</b>, replication &amp; governance', 'Publish, pre-flight, preview, locks, trees, bulk, safe delete, and Prod Guard')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-publish-menu-btn')
        await sleep(2000)
      },
    },
    {
      say: 'Publish page sends this page to the Publish tier through the AEM replication servlet. First it runs an automated pre-flight check on everything the page references, and when all assets are already live, the page goes out immediately.',
      do: async () => {
        await T.clickMenuItem(rec, 'Publish page')
        const t = await T.waitToolbarToast(rec, 'published')
        log('publish ->', t)
        await sleep(2500)
      },
    },
    {
      say: 'The toast confirms activation, and the status pill updates. Now Unpublish page takes it off the Publish tier again, with a single click.',
      do: async () => {
        await publishMenu(rec, 'Unpublish page')
        const t = await T.waitToolbarToast(rec, 'unpublished')
        log('unpublish ->', t)
        await sleep(2800)
      },
    },

    // ---- preview tier ---------------------------------------------------------------------------
    {
      say: 'On an AEM Cloud environment, you can also publish to the Preview tier only. This routes the replication request specifically to the cloud preview agent, allowing authors to validate content before publishing to the world.',
      do: async () => {
        await rec.goto(dev('preview-demo'), 3800)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-publish-menu-btn')
        await sleep(1800)
        await T.clickMenuItem(rec, 'Publish to Preview')
        const t = await T.waitToolbarToast(rec, 'Preview')
        log('preview ->', t)
        await sleep(2500)
      },
    },
    {
      say: 'The page details panel now reflects this distinction: the Preview tier is marked as published, while the public Publish tier remains safely in draft.',
      do: async () => {
        await togglePill(rec)
        await sleep(5200)
        await togglePill(rec)
      },
    },

    // ---- pre-flight with a problem --------------------------------------------------------------
    {
      say: 'Now let us see the pre-flight check protect content integrity. This page references an asset that has never been activated. Choose Publish page.',
      do: async () => {
        await rec.goto(dev('preflight-demo'), 3800)
        await T.expand(rec)
        await publishMenu(rec, 'Publish page')
        const d = await T.waitDialog(rec)
        log('preflight ->', d.title, '|', d.msg.replace(/\n+/g, ' ').slice(0, 150))
        await sleep(1500)
      },
    },
    {
      say: 'Before anything is sent to the publisher, Orbit intercepts the call and warns you about missing dependencies, preventing broken images on your live site. You can publish anyway or cancel to activate the asset first. I cancel.',
      do: async () => {
        await sleep(5200)
        await T.dialogCancel(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'cancelled')
        log('preflight cancel ->', t)
        await sleep(1800)
      },
    },

    // ---- lock / unlock (demonstrated in Touch UI Editor with pre & post states) ----------------
    {
      say: 'Content locks work seamlessly. Here, we navigate to the page inside the AEM Touch UI editor. Notice the page is initially unlocked, with all authoring tools and components fully editable.',
      do: async () => {
        const u = `${AUTHOR.dev}/editor.html${B}/lock-demo.html`
        await rec.goto(u, 4000)
        await sleep(1500)
        await T.expand(rec)
        await sleep(1200)
      },
    },
    {
      say: 'From the Command palette, choose Lock page. Orbit executes the lock against AEM’s native WCM command servlet.',
      do: async () => {
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await sleep(900)
        await rec.type('lock', 90)
        await sleep(900)
        await rec.key('Enter')
        const t = await T.waitToolbarToast(rec, 'locked')
        log('lock ->', t)
        await sleep(1800)
      },
    },
    {
      say: 'The lock displays immediately: a padlock icon on Orbit’s status pill, and the admin lock owner in the details panel. Reloading the page reflects AEM’s native locked editor state, preventing concurrent editing collisions.',
      do: async () => {
        await rec.hover('#asp-status-pill', 900)
        await sleep(1000)
        await togglePill(rec)
        await sleep(3500)
        await togglePill(rec)
        await sleep(800)
        // Reload editor to visualize AEM's native locked state
        const u = `${AUTHOR.dev}/editor.html${B}/lock-demo.html`
        await rec.goto(u, 3800)
        await sleep(1500)
      },
    },
    {
      say: 'Now unlock the page. From the Command palette, select Unlock page. Orbit releases the lock, and reloading the editor restores full authoring and editing capabilities.',
      do: async () => {
        await T.expand(rec)
        await sleep(600)
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await sleep(800)
        await rec.type('unlock', 90)
        await sleep(900)
        await rec.key('Enter')
        const t = await T.waitToolbarToast(rec, 'unlocked')
        log('unlock ->', t)
        await sleep(1800)
        // Reload editor to visualize AEM's native unlocked state restored
        const u = `${AUTHOR.dev}/editor.html${B}/lock-demo.html`
        await rec.goto(u, 3800)
        await sleep(1500)
      },
    },

    // ---- tree publish + dry run (popup) ---------------------------------------------------------
    {
      say: 'Publishing an entire section is handled inside the popup hub. Here is a site branch with nested children. Tree Publish never blind-fires; it always performs a dry run first.',
      do: async () => {
        const u = dev('tree-demo')
        await rec.goto(u, 3500)
        globalThis.__pop = await openPopup(rec)
        await sleep(2500)
        await rec.click('#treeActivateBtn', 900)
      },
    },
    {
      say: 'The dry run scans the hierarchy via QueryBuilder and counts the pages: five pages will go live, while one deliberately deactivated page is skipped and accounted for separately. Nothing has been published yet.',
      do: async () => {
        const d = await T.waitDialog(rec)
        log('tree dry run ->', d.msg.replace(/\n+/g, ' | ').slice(0, 260))
        await sleep(9000)
      },
    },
    {
      say: 'Confirm, and the pages are replicated in managed batches.',
      do: async () => {
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Published')
        log('tree publish ->', t)
        await sleep(3000)
      },
    },
    {
      say: 'Tree Unpublish provides the exact same governance, complete with its own pre-flight count and dry-run confirmation.',
      do: async () => {
        await rec.click('#treeDeactivateBtn', 900)
        const d = await T.waitDialog(rec)
        log('tree unpublish dry run ->', d.msg.replace(/\n+/g, ' | ').slice(0, 160))
        await sleep(5200)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Unpublished')
        log('tree unpublish ->', t)
        await sleep(2600)
      },
    },

    // ---- bulk replication (popup) ---------------------------------------------------------------
    {
      say: 'For arbitrary pages across different trees, use Bulk Publish. Paste up to two hundred paths or URLs, one per line, mixing formats freely.',
      do: async () => {
        await globalThis.__pop.close()
        const u = dev('bulk/p01')
        await rec.goto(u, 3500)
        globalThis.__pop = await openPopup(rec)
        await sleep(2200)
        await rec.click('#bulkBtn', 800)
        await sleep(900)
        await pasteBulk(rec, DEV_BULK)
        log('bulk count ->', await rec.tab.eval(`document.getElementById('bulkCount').textContent`))
        await sleep(1800)
      },
    },
    {
      say: 'Dry Run validates every target first, reporting their publication state: here all fifty are drafts.',
      do: async () => {
        await rec.click('#bulkDryRun', 800)
        await rec.waitFor('#bulkDryRunResults .list-row', 20000)
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const p = document.getElementById('mainPanel')
          if (p) p.scrollIntoView({ block: 'end', behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
          const r = document.getElementById('bulkDryRunResults')
          if (r) r.scrollIntoView({ block: 'end', behavior: 'smooth' })
        })()`)
        await sleep(600)
        const row = await rec.waitFor('#bulkDryRunResults .list-row', 5000)
        if (row) {
          await rec.moveTo(row.cx, row.cy, 600)
        }
        log('bulk dry run rows ->', await rec.tab.eval(`document.querySelectorAll('#bulkDryRunResults .list-row').length`))
        await sleep(3600)
      },
    },
    {
      say: 'Suppose an invalid path sneaks into the batch. Orbit processes items in groups of fifty. AEM rejects the invalid item, and Orbit isolates the error while reporting exactly how many succeeded.',
      do: async () => {
        await pasteBulk(rec, [BAD, ...DEV_BULK])
        await rec.tab.eval(`(() => {
          const btn = document.getElementById('bulkPublish')
          if (btn) btn.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })()`)
        await sleep(250)
        await rec.click('#bulkPublish', 800)
        const d = await T.waitDialog(rec)
        log('bulk confirm ->', d.title, '|', d.msg)
        await sleep(2600)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'published', 30000)
        log('bulk failure ->', t)
        await sleep(5200)
      },
    },
    {
      say: 'Successfully published pages are removed from the input. The textarea retains only the failed entries, so retrying will never duplicate work. We remove the bad path, and publish the rest cleanly.',
      do: async () => {
        log('failed list lines ->', await rec.tab.eval(`document.getElementById('bulkInput').value.split('\\n').length`))
        await sleep(2200)
        const keep = (await rec.tab.eval(`document.getElementById('bulkInput').value`)).split('\n').filter((l) => l && l !== BAD)
        await pasteBulk(rec, keep)
        await rec.tab.eval(`(() => {
          const btn = document.getElementById('bulkPublish')
          if (btn) btn.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })()`)
        await sleep(250)
        await rec.click('#bulkPublish', 800)
        await T.waitDialog(rec)
        await sleep(1500)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Published', 30000)
        log('bulk retry ->', t)
        await sleep(3200)
      },
    },

    // ---- safe delete ----------------------------------------------------------------------------
    {
      say: 'Page deletion is strictly guarded. It delegates to the standard WCM command servlet with force disabled, ensuring AEM prevents deletion if other pages reference this node.',
      do: async () => {
        await globalThis.__pop.close()
        await rec.goto(dev('delete-target'), 3800)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-more-btn')
        await sleep(1500)
        await T.clickMenuItem(rec, 'Delete page')
        const d = await T.waitDialog(rec)
        log('delete confirm ->', d.title, '|', d.msg)
        await sleep(3200)
      },
    },
    {
      say: 'Upon confirmation, AEM rejects the deletion: the page is linked by live content, so the repository remains intact and uncorrupted.',
      do: async () => {
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'blocked')
        log('delete blocked ->', t)
        await sleep(4200)
      },
    },
    {
      say: 'Unreferenced pages, however, can be deleted cleanly. Through the same menu and confirmation, the orphaned page is removed.',
      do: async () => {
        await rec.goto(dev('delete-free'), 3800)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-more-btn')
        await sleep(1200)
        await T.clickMenuItem(rec, 'Delete page')
        await T.waitDialog(rec)
        await sleep(2200)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'deleted')
        log('delete ->', t)
        await sleep(3600)
      },
    },

    // ---- Prod Guard -----------------------------------------------------------------------------
    {
      say: 'Finally, Prod Guard. Production environments are marked as protected, displaying a lock badge on the environment chip and a warning accent border. Any publishing operation here requires typed verification.',
      do: async () => {
        await rec.goto(prod('guard-demo'), 4200)
        await T.expand(rec)
        await rec.hover('#asp-env-chip', 900)
        await sleep(2200)
        await publishMenu(rec, 'Publish page')
        const d = await T.waitDialog(rec)
        log('prod guard ->', d.title, '|', d.label, '| disabled:', d.disabled)
        await sleep(2500)
      },
    },
    {
      say: 'The Confirm button remains completely disabled until you type the exact page name. A partial or mistyped name will not activate it.',
      do: async () => {
        await rec.click('.asp-dlg-input', 700)
        await rec.type('guard', 110)
        await sleep(1200)
        log('partial ->', JSON.stringify(await T.dialogState(rec)))
        await sleep(1500)
      },
    },
    {
      say: 'Only entering the full name enables confirmation, ensuring destructive actions on Production are always deliberate.',
      do: async () => {
        await rec.type('-demo', 110)
        await sleep(1200)
        log('full ->', JSON.stringify(await T.dialogState(rec)))
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'published')
        log('prod publish ->', t)
        await sleep(3200)
      },
    },
    {
      say: 'Prod Guard also protects bulk activations, where you must type the exact number of pages to be published. Three pages, so I type three.',
      do: async () => {
        await rec.untitle()
        const u = prod('bulk/p01')
        await rec.goto(u, 3800)
        globalThis.__pop = await openPopup(rec)
        await sleep(2000)
        await rec.click('#bulkBtn', 800)
        await sleep(800)
        await pasteBulk(rec, [`${B}/bulk/p01`, `${B}/bulk/p02`, `${B}/bulk/p03`])
        await rec.click('#bulkPublish', 800)
        const d = await T.waitDialog(rec)
        log('prod bulk ->', d.title, '|', d.label, '| disabled:', d.disabled)
        await sleep(2600)
        await rec.click('.asp-dlg-input', 700)
        await rec.type('3', 120)
        await sleep(1400)
        log('typed ->', JSON.stringify(await T.dialogState(rec)))
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitPopupToast(rec, 'Published', 30000)
        log('prod bulk publish ->', t)
        await sleep(3200)
      },
    },
    {
      say: 'That is AEM Orbit’s authoring suite: instant publishing, pre-flight dependency protection, preview tier isolation, tree activation, safe deletion, and strict Production Guard safety.',
      do: async () => {
        await globalThis.__pop.close()
        await rec.moveTo(1250, 520, 800)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
