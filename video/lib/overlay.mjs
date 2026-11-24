// In-page overlay used while recording: animated cursor, click ripple and a top-aligned chapter title.
// Injected into every document of the recorded tab. Everything is pointer-events:none so it never
// changes how AEM or the extension react. Source of truth for position is the real mouse events
// that the recorder sends through the DevTools protocol, so cursor and hover/click are always in sync.
export const OVERLAY_SOURCE = String.raw`(() => {
  if (window.__orbitDemo) return;
  const HOST_ID = 'orbit-demo-overlay';
  const state = { x: 960, y: 700, title: '', sub: '', shown: false };
  window.__orbitDemo = state;

  const css = ` + '`' + String.raw`
    :host { all: initial }
    .cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px; margin: -3px 0 0 -3px; z-index: 2;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); transform: translate(var(--x), var(--y)); will-change: transform }
    .cursor.down svg { transform: scale(.86) } .cursor svg { transition: transform .08s ease-out; transform-origin: 3px 3px }
    .ripple { position: fixed; left: 0; top: 0; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
      border: 3px solid rgba(96,165,250,.95); background: rgba(96,165,250,.28); z-index: 1; opacity: 0;
      transform: translate(var(--x), var(--y)) scale(.3) }
    .ripple.go { animation: rip .62s cubic-bezier(.2,.7,.3,1) forwards }
    @keyframes rip { 0% { opacity: 1; transform: translate(var(--x), var(--y)) scale(.3) }
      100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(3.6) } }
    .title { position: fixed; top: 22px; left: 50%; z-index: 3; transform: translate(-50%, -14px); opacity: 0;
      transition: opacity .45s ease, transform .45s ease; min-width: 520px; max-width: 1280px; padding: 14px 30px 15px;
      border-radius: 16px; background: rgba(13,17,23,.90); border: 1px solid rgba(110,150,220,.35);
      box-shadow: 0 10px 34px rgba(0,0,0,.45); text-align: center;
      font: 600 30px/1.2 -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif; color: #f3f6fb; letter-spacing: .1px }
    .title.on { opacity: 1; transform: translate(-50%, 0) }
    .title small { display: block; margin-top: 6px; font: 500 17px/1.35 -apple-system, "SF Pro Text", system-ui, sans-serif; color: #9db4d8 }
    .title b { color: #60a5fa; font-weight: 700 }
    .tag { position: fixed; left: 24px; bottom: 22px; z-index: 3; padding: 7px 14px; border-radius: 10px; opacity: 0;
      background: rgba(13,17,23,.88); border: 1px solid rgba(250,190,70,.55); color: #fbd38d; transition: opacity .35s;
      font: 600 15px/1.3 -apple-system, system-ui, sans-serif }
    .tag.on { opacity: 1 }
  ` + '`' + String.raw`;

  function mount() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    // Popover = browser top layer: always above the extension's own max z-index UI, so the cursor is never hidden behind the orb.
    host.setAttribute('popover', 'manual');
    host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>' + css + '</style>' +
      '<div class="ripple"></div>' +
      '<div class="cursor"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2.2v17.6l4.9-4.3 3.1 6.6 3.1-1.5-3.1-6.5h6.7z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg></div>' +
      '<div class="title"></div><div class="tag"></div>';
    (document.documentElement || document).appendChild(host);
    try { host.showPopover(); } catch { /* older engines: falls back to z-index */ }
    // dialogs opened later (showModal) enter the top layer after us; re-assert on demand
    state.raise = () => { try { host.hidePopover(); host.showPopover(); } catch { /* ignore */ } };
    const cur = root.querySelector('.cursor'), rip = root.querySelector('.ripple');
    const tt = root.querySelector('.title'), tag = root.querySelector('.tag');
    const place = (x, y) => { state.x = x; state.y = y;
      cur.style.setProperty('--x', x + 'px'); cur.style.setProperty('--y', y + 'px'); };
    place(state.x, state.y);
    const hide = () => { cur.style.display = state.cursorHidden ? 'none' : ''; };
    addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
    addEventListener('mousedown', (e) => {
      cur.classList.add('down');
      rip.style.setProperty('--x', e.clientX + 'px'); rip.style.setProperty('--y', e.clientY + 'px');
      rip.classList.remove('go'); void rip.getBoundingClientRect(); rip.classList.add('go');
    }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
    state.api = {
      place, hide,
      title(html, sub) { tt.innerHTML = html + (sub ? '<small>' + sub + '</small>' : ''); tt.classList.add('on'); },
      untitle() { tt.classList.remove('on'); },
      tag(text) { if (text) { tag.textContent = text; tag.classList.add('on'); } else tag.classList.remove('on'); },
    };
    if (state.title) state.api.title(state.title, state.sub);
    if (state.tagText) state.api.tag(state.tagText);
  }
  if (document.documentElement) mount();
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); mount(); } }).observe(document, { childList: true });
  document.addEventListener('DOMContentLoaded', mount);
})();`
