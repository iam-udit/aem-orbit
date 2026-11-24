// Toolbar / dialog / toast helpers shared by the chapters that drive the in-page toolbar.
// (02-toolbar.mjs keeps its own private copies; this file is for chapters 03 onwards.)
import { sleep } from './cdp.mjs'

export const META = 4 // CDP modifier bit for Cmd (macOS)

/** Make sure the Orb has opened into the full horizontal toolbar (click the logo if it has not). */
export async function expand(rec) {
  await rec.waitFor('#asp-logo-btn', 15000)
  for (let i = 0; i < 3; i++) {
    const r = await rec.rectOf('#asp-tier-btn')
    if (r?.vis) return
    await rec.click('#asp-logo-btn', 800)
    await sleep(1300)
  }
  throw new Error('toolbar did not expand')
}

/** Click a toolbar button and wait for the menu it opens. */
export async function openMenu(rec, selector) {
  await rec.click(selector, 800)
  await rec.waitFor('#asp-menu .asp-menu-item', 12000)
  await sleep(700)
}

export async function menuItemRect(rec, text) {
  return rec.tab.eval(`(() => { const it = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
    .find((b) => {
      const s = b.textContent.trim().toLowerCase()
      const t = ${JSON.stringify(text.toLowerCase())}
      return s.startsWith(t) || s.includes(t)
    }); if (!it) return null
    const r = it.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } })()`)
}

export async function clickMenuItem(rec, text) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 800)
  await sleep(350)
  await rec.clickHere()
}

/** Toolbar toast (#asp-toast) text, or '' when none is showing. */
export const toolbarToast = (rec) => rec.tab.eval(`(() => { const t = document.getElementById('asp-toast'); return t && t.classList.contains('asp-toast-show') ? t.textContent.trim() : '' })()`)

/** Wait until the toolbar toast contains `text`; returns its full text. */
export async function waitToolbarToast(rec, text, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const t = await toolbarToast(rec)
    if (t.includes(text)) return t
    await sleep(120)
  }
  throw new Error(`toast not shown: ${text}`)
}

/** Popup toast (#toast) text. */
export const popupToast = (rec) => rec.tab.eval(`(() => { const t = document.getElementById('toast'); return t && t.classList.contains('show') ? t.textContent.trim() : '' })()`)

export async function waitPopupToast(rec, text, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const t = await popupToast(rec)
    if (t.includes(text)) return t
    await sleep(100)
  }
  throw new Error(`popup toast not shown: ${text}`)
}

// ---- confirmation dialog (src/ui/dialog.js, same markup in the toolbar and the popup) ---------------
export async function waitDialog(rec, timeout = 20000) {
  await rec.waitFor('.asp-dlg-overlay .asp-dlg-primary', timeout)
  await sleep(500)
  return rec.tab.eval(`(() => ({ title: document.querySelector('.asp-dlg-title')?.textContent, msg: document.querySelector('.asp-dlg-msg')?.textContent,
    detail: document.querySelector('.asp-dlg-detail')?.textContent, label: document.querySelector('.asp-dlg-label')?.textContent,
    confirm: document.querySelector('.asp-dlg-primary')?.textContent, disabled: document.querySelector('.asp-dlg-primary')?.disabled }))()`)
}
export const dialogState = (rec) => rec.tab.eval(`(() => ({ disabled: document.querySelector('.asp-dlg-primary')?.disabled, value: document.querySelector('.asp-dlg-input')?.value }))()`)
export const dialogConfirm = (rec) => rec.click('.asp-dlg-overlay .asp-dlg-primary', 800)
export const dialogCancel = (rec) => rec.click('.asp-dlg-overlay .asp-dlg-btn:not(.asp-dlg-primary)', 800)
export async function dialogGone(rec, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (!(await rec.tab.eval(`!!document.querySelector('.asp-dlg-overlay')`))) return
    await sleep(100)
  }
  throw new Error('dialog did not close')
}

/** Paste text into the focused field in one go (a real paste), the way a user pastes a list of paths. */
export async function paste(rec, text) { await rec.tab.send('Input.insertText', { text }) }
