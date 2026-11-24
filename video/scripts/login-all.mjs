// Log the recording browser into every author host through the real AEM login form (session cookies only).
//   ORBIT_ADMIN_PW=... node video/scripts/login-all.mjs
import process from 'node:process'
import { newTab, sleep } from '../lib/cdp.mjs'

const pw = process.env.ORBIT_ADMIN_PW
if (!pw) throw new Error('Set ORBIT_ADMIN_PW')
const hosts = ['http://localhost:4502', 'https://dev-cloud-author.com', 'https://stage-cloud-author.com', 'https://prod-cloud-author.com']

const t = await newTab('about:blank')
await t.send('Page.enable')
for (const h of hosts) {
  await t.send('Page.navigate', { url: `${h}/libs/granite/core/content/login.html` })
  await sleep(2500)
  const has = await t.eval('!!document.querySelector("#username")')
  if (has) {
    await t.eval(`(() => { document.querySelector('#username').value = 'admin'; document.querySelector('#password').value = ${JSON.stringify(pw)}; document.querySelector('form').submit(); return 1 })()`)
    await sleep(3000)
  }
  await t.send('Page.navigate', { url: `${h}/libs/granite/csrf/token.json` })
  await sleep(800)
  const body = await t.eval('document.body.innerText')
  console.log(h, body.includes('token') ? 'logged in' : `NOT logged in: ${body.slice(0, 60)}`)
}
t.close()
process.exit(0)
