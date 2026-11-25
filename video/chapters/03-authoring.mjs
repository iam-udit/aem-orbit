// Chapter 3 (v4) - Authoring, Replication, Pre-Flight & Production Guard.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/03-authoring.mjs
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

async function publishMenu(rec, item) {
  await T.openMenu(rec, '#asp-publish-menu-btn')
  await sleep(900)
  await T.clickMenuItem(rec, item)
}

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

await runChapter('03-authoring-v4', {
  url: dev('publish-demo'),
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 3: authoring, replication, and governance. Everything here is one or two clicks from the toolbar, and destructive actions are verified before execution.',
      do: async () => {
        await rec.title('Chapter 3 · <b>Authoring</b>, replication &amp; governance', 'Publish, pre-flight, preview, locks, trees, bulk, safe delete, and Prod Guard')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-publish-menu-btn')
        await sleep(1800)
      },
    },
    {
      say: 'Publish page activates via the AEM replication servlet after verifying referenced assets. Unpublish takes it cleanly back offline in one click.',
      do: async () => {
        await T.clickMenuItem(rec, 'Publish page')
        const t = await T.waitToolbarToast(rec, 'published')
        log('publish ->', t)
        await sleep(2200)
        await publishMenu(rec, 'Unpublish page')
        const t2 = await T.waitToolbarToast(rec, 'unpublished')
        log('unpublish ->', t2)
        await sleep(2200)
      },
    },
    {
      say: 'On AEM Cloud, Publish to Preview targets only the Cloud Preview agent, keeping public Publish in draft while validating staged content.',
      do: async () => {
        await rec.goto(dev('preview-demo'), 3600)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-publish-menu-btn')
        await sleep(1400)
        await T.clickMenuItem(rec, 'Publish to Preview')
        const t = await T.waitToolbarToast(rec, 'Preview')
        log('preview ->', t)
        await sleep(2000)
        await togglePill(rec)
        await sleep(4200)
        await togglePill(rec)
      },
    },
    {
      say: 'Pre-flight dependency checking scans assets before replication. Missing images trigger an interactive warning so you never ship broken pages live.',
      do: async () => {
        await rec.goto(dev('preflight-demo'), 3600)
        await T.expand(rec)
        await publishMenu(rec, 'Publish page')
        await T.waitDialog(rec)
        await sleep(4500)
        await T.dialogCancel(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'cancelled')
        await sleep(1500)
      },
    },
    {
      say: 'Page locking toggles WCM locks straight from Command+K and updates both the toolbar padlock indicator and Touch UI authoring frames.',
      do: async () => {
        const u = `${AUTHOR.dev}/editor.html${B}/lock-demo.html`
        await rec.goto(u, 5200)
        await T.expand(rec)
        await sleep(800)
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await rec.waitFor('#asp-palette', 5000)
        await sleep(500)
        await rec.type('lock', 90)
        await sleep(800)
        await rec.key('Enter')
        await T.waitToolbarToast(rec, 'locked')
        await sleep(1400)
        await togglePill(rec)
        await sleep(2800)
        await togglePill(rec)
        await rec.goto(u, 4800)
        await T.expand(rec)
        await sleep(800)
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await rec.waitFor('#asp-palette', 5000)
        await sleep(500)
        await rec.type('unlock', 90)
        await sleep(800)
        await rec.key('Enter')
        await T.waitToolbarToast(rec, 'unlocked')
        await sleep(1600)
      },
    },
    {
      say: 'Tree Publish inside the popup always executes a pre-flight dry run via QueryBuilder first, counting live targets and skipped inactive children before publishing in managed batches.',
      do: async () => {
        await rec.goto(dev('tree-demo'), 3500)
        globalThis.__pop = await openPopup(rec)
        await sleep(2000)
        await rec.click('#treeActivateBtn', 800)
        const d = await T.waitDialog(rec)
        log('tree dry run ->', d.msg.replace(/\n+/g, ' | ').slice(0, 220))
        await sleep(5500)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitPopupToast(rec, 'Published')
        await sleep(2200)
        await rec.click('#treeDeactivateBtn', 800)
        await T.waitDialog(rec)
        await sleep(3200)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitPopupToast(rec, 'Unpublished')
        await sleep(2000)
      },
    },
    {
      say: 'Bulk replication handles up to two hundred paths or URLs with dry-run status checks and error isolation, keeping only failed rows in the input for clean retries.',
      do: async () => {
        await globalThis.__pop.close()
        await rec.goto(dev('bulk/p01'), 3500)
        globalThis.__pop = await openPopup(rec)
        await sleep(1800)
        await rec.click('#bulkBtn', 700)
        await sleep(800)
        await pasteBulk(rec, DEV_BULK)
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
        await sleep(2800)
        await pasteBulk(rec, [BAD, ...DEV_BULK])
        await rec.tab.eval(`document.getElementById('bulkPublish')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
        await sleep(300)
        await rec.click('#bulkPublish', 800)
        await T.waitDialog(rec)
        await sleep(1800)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitPopupToast(rec, 'published', 30000)
        await sleep(3200)
        const keep = (await rec.tab.eval(`document.getElementById('bulkInput').value`)).split('\n').filter((l) => l && l !== BAD)
        await pasteBulk(rec, keep)
        await rec.tab.eval(`document.getElementById('bulkPublish')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
        await sleep(300)
        await rec.click('#bulkPublish', 800)
        await T.waitDialog(rec)
        await sleep(1200)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitPopupToast(rec, 'Published', 30000)
        await sleep(2400)
      },
    },
    {
      say: 'Safe deletion uses force false so AEM rejects referenced nodes while removing orphaned pages cleanly.',
      do: async () => {
        await globalThis.__pop.close()
        await rec.goto(dev('delete-target'), 3600)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-more-btn')
        await T.clickMenuItem(rec, 'Delete page')
        await T.waitDialog(rec)
        await sleep(2200)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'blocked')
        await sleep(2800)
        await rec.goto(dev('delete-free'), 3600)
        await T.expand(rec)
        await T.openMenu(rec, '#asp-more-btn')
        await T.clickMenuItem(rec, 'Delete page')
        await T.waitDialog(rec)
        await sleep(1800)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'deleted')
        await sleep(2400)
      },
    },
    {
      say: 'Finally, Prod Guard enforces typed confirmation across protected environments—requiring the exact page name for single actions or the exact batch count for bulk releases.',
      do: async () => {
        await rec.goto(prod('guard-demo'), 4000)
        await T.expand(rec)
        await rec.hover('#asp-env-chip', 800)
        await sleep(1200)
        await publishMenu(rec, 'Publish page')
        await T.waitDialog(rec)
        await sleep(1600)
        await rec.click('.asp-dlg-input', 600)
        await rec.type('guard', 100)
        await sleep(1000)
        await rec.type('-demo', 100)
        await sleep(1000)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'published')
        await sleep(2400)

        await rec.goto(prod('bulk/p01'), 3600)
        globalThis.__pop = await openPopup(rec)
        await sleep(1800)
        await rec.click('#bulkBtn', 700)
        await sleep(700)
        await pasteBulk(rec, [`${B}/bulk/p01`, `${B}/bulk/p02`, `${B}/bulk/p03`])
        await rec.click('#bulkPublish', 800)
        await T.waitDialog(rec)
        await sleep(1800)
        await rec.click('.asp-dlg-input', 600)
        await rec.type('3', 120)
        await sleep(1000)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitPopupToast(rec, 'Published', 30000)
        await sleep(2400)
        await globalThis.__pop.close()
        await rec.moveTo(1250, 520, 800)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
