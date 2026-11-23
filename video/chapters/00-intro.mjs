// Chapter 0 - Short introduction to the tool. Run: ORBIT_ADMIN_PW=admin node video/chapters/00-intro.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

await runChapter('00-intro', {
  url: `${AUTHOR.dev}${PAGE}`,
  steps: (rec) => [
    { say: 'This is AEM Orbit, a Chrome extension for people who work in Adobe Experience Manager every day.',
      do: async () => {
        await rec.title('AEM <b>Orbit</b>', 'Author, publish and CDN in one floating control surface', 0)
        await rec.moveTo(1250, 520, 1400)
      } },
    { say: 'It sits on top of any A E M page and keeps the same page one click away on Local, Dev, Stage and Prod, on the author, the publisher and the C D N.',
      do: async () => { await rec.moveTo(960, 960, 1300); await sleep(500) } },
    { say: 'From there you can edit, preview and publish, check references first, and guard production with typed confirmations.',
      do: async () => { await rec.hover('#asp-logo-btn', 900); await sleep(1500) } },
    { say: 'It also brings developer tools into the page: a J C R inspector, component and asset inspectors, cache headers, and a quick S E O and accessibility audit.',
      do: async () => { await sleep(1800) } },
    { say: 'Everything runs inside your browser. There is no telemetry and no external service, and your credentials never touch the page.',
      do: async () => { await rec.moveTo(1250, 520, 900); await sleep(1200) } },
    { say: 'Let us start with the part you will use most: the Orb.',
      do: async () => { await rec.untitle(); await sleep(800) } },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
