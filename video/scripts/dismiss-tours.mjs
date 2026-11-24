// Dismiss AEM's first-run tour popups ("Modes", "Product Navigation") once per author, so they never cover the recording.
// The "Don't show this again" box is ticked by default; clicking Close stores the choice on the user profile.
import { newTab, sleep } from '../lib/cdp.mjs'

const hosts = ['http://localhost:4502', 'https://dev-cloud-author.com', 'https://stage-cloud-author.com', 'https://prod-cloud-author.com']
const pages = ['/sites.html/content/wknd/us/en', '/editor.html/content/wknd/us/en/magazine.html', '/assets.html/content/dam/wknd', '/mnt/overlay/wcm/core/content/sites/properties.html?item=/content/wknd/us/en/magazine']
const t = await newTab('about:blank')
await t.send('Page.enable')
for (const h of hosts) {
  for (const pg of pages) {
    await t.send('Page.navigate', { url: h + pg })
    await sleep(4500)
    for (let i = 0; i < 4; i++) {
      const closed = await t.eval(`(() => { const b = [...document.querySelectorAll('coral-popover button, .coral-Popover button, [role=dialog] button, coral-dialog button')]
        .find((x) => /^\\s*close\\s*$/i.test(x.textContent) && x.offsetParent); if (b) { b.click(); return true } return false })()`)
      if (!closed) break
      await sleep(700)
    }
  }
  console.log('tours handled on', h)
}
t.close()
process.exit(0)
