# AEM Orbit walkthrough video - handoff / resume guide

Paste this file's path into a new task: `video/HANDOFF.md`. Read it fully, then do only the chapter named under "NEXT".
Keep this file updated at the end of every task (status table + "Last session notes").

**The full feature list to cover is `video/FEATURES.md`** (the user's list verbatim, one checkbox per item, each tagged with its chapter).
Before recording a chapter, read the items tagged with that chapter; narrate and show every one of them. After the chapter passes
`verify-chapter.mjs`, tick those boxes in FEATURES.md. Never tick an item that was not visibly demonstrated in the rendered video.

## Goal
1920x1080 / 60 fps live-action walkthrough of the **AEM Orbit** Chrome extension (dark theme), recorded from real browser frames
against local AEM instances (WKND, `/content/wknd`), neural voiceover, animated cursor, click ripples, top-aligned chapter titles.
Must cover every feature in the user's 10-section list (see "Coverage map"). Do NOT read or reuse anything under `dist/`,
nor the user's untracked `scripts/capture-*`, `scripts/generate-*`, `scripts/record-*`.
Final output: `video/out/orbit-for-aem-walkthrough.mp4` (full, ~15-18 min) + a ~3 min highlights cut.

## Rules and Instructions (Mandatory for All Recordings & Maintenance)

### 1. Visual & Recording Standards
- **Screen Mode Standard**: Every chapter must be recorded in full 1080p screen mode (real Chrome window, address bar, padlock, tab strip, pinned Orbit extension icon, and real popup dropdown). Legacy page-only CDP screencast (`ORBIT_SCREEN=0`) is deprecated. Never inject artificial URL pills; the Chrome address bar displays URLs directly.
- **Chapter Pill Heading Rule**: The top chapter title card (`rec.title(...)`) must be shown ONLY for the first few frames (initial ~3.5 s of the chapter) and then cleared cleanly with `await rec.untitle()` before main actions begin. It must NEVER stick across the entire video or every frame.
  - *Styling*: Must use bold accent styling for the chapter keyword (`rec.title('Chapter N · <b>Keyword</b> ...', 'Subtitle description')`) and always include a descriptive subtitle. Never use plain white text without subtitle.
- **Popup Action Results Scrolling Rule**: Whenever an action in the extension popup is triggered (Compare environments, Version timeline, URL variants copy, Bulk publish dry run, Find & Replace, Action log, etc.), the result container appears near or below the fold. The script MUST scroll smoothly to the bottom or mouse action point (`window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })`, `panel.scrollIntoView({ block: 'end' })`, `panelContent.scrollTo(...)`, `el.scrollIntoView({ block: 'center' })`) so that all diff tables, list rows, and action buttons are 100% visible before any subsequent click or mouse movement.
- **Physical Mouse Off-Screen Parking Rule**: When recording in screen mode, the physical macOS Quartz mouse cursor must be parked off-screen (`WINDOW_LEFT + 2500, 500`) to prevent native Chrome tooltips (e.g. extension pin hover tooltip) or native OS cursors from appearing in the recorded footage.
- **Pre-Recording Tab Cleanliness**: Always ensure `curl -s http://127.0.0.1:9333/json/list` shows about 1 page tab before recording (close leftover popup tabs via `/json/close/<id>`).

### 2. Voiceover & Audio Standards
- **Standard Voice**: Voice A = `en-US-ChristopherNeural`, rate `+3%` (Microsoft Edge neural TTS, loudnorm to -16 LUFS, AAC 192k) across all chapters, the full walkthrough, and the highlights cut.
- **Jointed Acronyms Rule**: All acronyms must be pronounced as jointed letters without spaces ("AEM", "JCR", "CDN", "SEO", "DAM", "MSM", "CFM", "OSGi", "UI", "DOM", "CSRF", "JSON", "EDS", "SSO", "SAML", "Touch UI", "CRXDE").

### 3. File & Deliverable Preservation
- **Preserve Originals**: Never overwrite previous version files in `video/out/`. Always keep them intact (`-v1.mp4`, `-v2.mp4`, `-v3.mp4`).
- **Canonical Release Files**:
  - The canonical release filenames are `<id>.mp4` (e.g. `00-intro.mp4`, `01-orb.mp4`, ..., `11-shortcuts.mp4`).
  - Active release files are copied/promoted to `<id>.mp4`, with `-final.mp4` symlinks pointing to `<id>.mp4`.
  - This ensures `tutorial.js` metadata and release URLs remain permanent and version-agnostic.
- **Deliverables**:
  - Full Walkthrough (`v4` canonical): `video/out/orbit-for-aem-walkthrough-v4.mp4` and `video/out/orbit-for-aem-walkthrough.mp4` (`1806.80s` / `30.11 min`, `178.6 MB`, `1920x1080` @ `60fps`) with 13 embedded native MP4 chapter markers. (`orbit-for-aem-walkthrough-v3.mp4` preserved untouched.)
  - Highlights Cut (`v4` canonical): `video/out/orbit-for-aem-highlights-v4.mp4` and `video/out/orbit-for-aem-highlights.mp4` (`192.02s` / `3.20 min`, `21.0 MB`, `1920x1080` @ `60fps`).
  - Overview Teaser (`v4` canonical): `video/out/orbit-for-aem-teaser-1min-v4.mp4` and `video/out/orbit-for-aem-teaser-1min.mp4` (`55.00s`, `6.1 MB`, `1920x1080` @ `60fps`).
  - Tutorial Page: `docs/tutorial/` (`index.html`, `tutorial.css`, `tutorial.js`, `posters/*.jpg`, `videos/`).
  - All 13 chapter scripts: `video/chapters/*.mjs` (`00-intro.mjs` through `11-shortcuts.mjs`, unversioned filenames; legacy `*-v2.mjs`/`*-v3.mjs` script duplicates removed).
  - Batch orchestration & assembly scripts: `video/scripts/record-all.mjs`, `video/scripts/assemble-walkthrough.mjs`, `video/scripts/build-teaser.mjs`.

### 4. Code & Architecture Standards
- **Options Policy Banner Placement**: In `src/options/options.js`, the managed policy banner (`lockBanner`) must be inserted *after* `.topbar` via `topbar.after(banner)` with clean margin (`margin: 0 0 20px; box-sizing: border-box;`) to prevent overlapping with the sticky topbar.
- **EDS Content Script Mounting**: Content scripts only mount on configured origins. Always ensure `.aem.page` and `.aem.live` are registered under `environments.dev` (`previewHost` and `dispatcherHost`).
- **Security & Sandboxing**: Extension services bind `127.0.0.1` only; passwords passed exclusively via `ORBIT_ADMIN_PW=admin`; certificate validation stays enabled (local CA trusted in keychain).

### 5. Content Resets Before Recording
| Chapter | Reset Command | What it Prepares |
|---|---|---|
| Ch 2 | `ORBIT_ADMIN_PW=admin python3 video/env/demo-content.py` + unpublish `toast-demo` | Rich layout on `orbit-demo`, scheduled `status-demo`, draft `toast-demo` |
| Ch 3 | `ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py` | Dev publish/preview/preflight/lock/delete pages, `tree-demo` with deactivated child `d`, 50 bulk pages, Prod Guard pages |
| Ch 5 | `ORBIT_ADMIN_PW=admin python3 video/env/ch5-content.py` | Dev vs Local `sync-demo` property diff, Prod live `expedition` page with Local 404 pre-stage |
| Ch 6 | `ORBIT_ADMIN_PW=admin python3 video/env/ch6-content.py` | `good-page` (Score 92) vs `bad-page` (Score 32 with 404 broken link detection) |

### 6. Workflow Limits & Execution
- **One chapter per task**: Focus on one chapter or task, finish, update status, and stop.
- **Image Budget**: Never view more than ~2 images per task step. Prefer programmatic checks (`ffprobe`, `verify-chapter.mjs`, log inspection, pixel stats). When visual inspection is unavoidable: ONE contact sheet (<= 4x3 tiles, scaled <= 1600px wide).
- **Detached Execution**: Long runs must be launched detached: `python3 video/scripts/detach.py /tmp/<log> node video/chapters/<file>.mjs`.
- **Quality Checks**: After recording, run `node video/scripts/verify-chapter.mjs <id>` (must be OK), run `npm test` (all 266 pass), and run `npx eslint video src` (0 errors).

## Environment (all run detached; they die on reboot)
| Env | Author | Publish | Browser host |
|---|---|---|---|
| Local | http://localhost:4502 | http://localhost:4503 | - |
| Dev | 4512 | 4513 | https://dev-cloud-author.com / -publish / -preview, CDN https://wwwdev.wknd.com |
| Stage | 4522 | 4523 | https://stage-cloud-* , CDN https://wwwstage.wknd.com |
| Prod | 4532 | 4533 | https://prod-cloud-* , CDN https://www.wknd.com |

- Admin login `admin` (password in `ORBIT_ADMIN_PW`). Instances live in `../Servers/{dev,stage,prod}[-publish]`; restart with
  `../Servers/launch.py <dir> <port> [author|publish]`. Do NOT touch 4502/4503 except for demo content.
- Edge proxy `video/env/proxy.mjs` (127.0.0.1:8443, flush server :8480, log `/tmp/orbit-proxy.log`): URL mapping, no `.html`,
  CDN-style `Via/Age/X-Cache/Cache-Control`. Rules in `video/env/url-mappings.txt`. Dev/Stage/Prod: Append .html OFF,
  Apply URL mapping to Publish/Preview ON.
- Certs: `~/.aem-orbit-demo/` (CA name-constrained to the 12 demo hosts, expires 22 Dec 2026).
- Dev/Stage/Prod have `/content/wknd/us/en/homepage`, `/de/de/homepage`, `/de/de/magazine` created and published. Local publisher
  does not have them (only Dev/Stage/Prod do). MSM: `/content/wknd/language-masters/{en,de,es,fr,it}`; `us/es` is empty.
- Chrome for Testing 158 (needed for `--load-extension`) at `video/build/browser/`, CDP `127.0.0.1:9333`, profile `/tmp/orbit-chrome-profile`.

### AEM instances (8 total) - how they were built, how to restart
- Servers dir: `../Servers` (sibling directory of the repo). Local 4502/4503 are separate local instances (not in that folder). Dev/Stage/Prod authors are `dev/ stage/ prod/` (jar `aem-author-p45x2.jar`, unpacked from
  `aem-author-p4502.jar`); publishers are `dev-publish/ stage-publish/ prod-publish/` (jar `aem-publish-p45x3.jar`).
- Start one (fully detached from the tool shell): `python3 ../Servers/launch.py dev 4512 author`, `... dev-publish 4513 publish`,
  `... stage 4522 author`, `... stage-publish 4523 publish`, `... prod 4532 author`, `... prod-publish 4533 publish`.
  Allow ~2-4 min for each to answer `/libs/granite/core/content/login.html`. Helpers: `Servers/run_detached.py <log> <cwd> <cmd...>`,
  `Servers/provision_publish.py`.
- WKND is installed on all 8 (package `aem-guides-wknd.all-4.1.0-SNAPSHOT.zip` from `../aem-guides-wknd/all/target/`). Package Manager upload
  command is `/crx/packmgr/service/.json/?cmd=upload` (NOT `service.jsp`). The WKND `core` bundle must be Active; it was rebuilt against the
  2025.4 SDK API (`-Daem.sdk.api=2025.4.20476.20250414T214138Z-250300 -Dcore.wcm.components.version=2.28.0`) because the newest SDK made imports unresolvable.
- Replication agents on Dev/Stage/Prod authors (created by `video/env/provision.py agents`, needs `ORBIT_ADMIN_PW`): `publish` -> that env's publisher,
  `flush` -> `http://127.0.0.1:8480/dispatcher/invalidate.cache` (sends `CQ-Handle`), `preview` -> same publisher. Each agent needs
  `userId: admin` or replication fails with "Invalid userId". Pages (homepage, de/de homepage + magazine) come from `provision.py pages`.
  Agents on Local 4502 are never modified.

### Edge proxy, CDN simulation and domain mapping
- Start (detached, it dies on reboot): `python3 video/scripts/detach.py /tmp/orbit-proxy.log node video/env/proxy.mjs`
  (binds `127.0.0.1:8443` TLS and `127.0.0.1:8480` flush; certs from `~/.aem-orbit-demo/server.{crt,key}`; TLS >= 1.2).
- Chrome resolves the names with `--host-resolver-rules` (set in `launch-chrome.mjs`): `MAP *.wknd.com|*-cloud-author.com|*-cloud-publish.com|
  *-cloud-preview.com 127.0.0.1:8443`. No /etc/hosts edit, no port 443, no sudo.
- Host routing: `<env>-cloud-author.com` -> that author; `<env>-cloud-publish.com` and `<env>-cloud-preview.com` -> that env's publisher (the local SDK
  has no separate preview tier); CDN `wwwdev.wknd.com`, `wwwstage.wknd.com`, `www.wknd.com` -> publisher through a dispatcher simulation
  (extension-less URLs, in-memory cache TTL 300 s, headers `Age`, `Cache-Control`, `Via: 1.1 dispatcher-sim`, `X-Cache: HIT|MISS`; `/crx`, `/system`,
  `/bin/(querybuilder|wcmcommand|replicate)` etc. are hidden on CDN hosts). Flush endpoint invalidates by `CQ-Handle` (verified HIT -> flush -> MISS).
- The user's URL-mapping rules (`video/env/url-mappings.txt`, also seeded into the extension setting `urlMappings`):
  ```
  /content/wknd/us/en = /
  /content/wknd/us/en/homepage == /
  /content/wknd/us/en/homepage == /us-en
  /content/wknd/de/de/homepage == /de-de
  /content/wknd/de/de = /de-de
  ```
  `=` is a prefix rule, `==` an exact redirect rule. Example: `/content/wknd/us/en/magazine.html` -> `https://wwwdev.wknd.com/magazine`.
- Extension environment config (`seed-settings.mjs`): Local = `http://localhost:4502/4503`, no CDN. Dev/Stage/Prod = the https hosts above,
  `dispatcherOmitHtml:true` ("Append .html" OFF), `publishUsesMappings:true` ("Apply URL mapping to Publish/Preview" ON), Prod `protected:true`,
  auth basic `admin`; secrets are written to `chrome.storage.local.secrets` at seed time from `ORBIT_ADMIN_PW`.
- Certificates (`~/.aem-orbit-demo/`): `ca.crt` "AEM Orbit Demo Local CA" - name-constrained (critical) to exactly the 12 demo hostnames, valid to
  **22 Dec 2026**; `server.crt` "AEM Orbit Demo Server" signed by it, SAN = the same 12 hosts; `*.key` are mode 600 and never committed.
  The user already trusted the CA in their login keychain, so Chrome shows 0 certificate errors. If the cert expires or a host is added, regenerate
  with openssl using `ca.cnf`/`server.cnf` in that folder, restart the proxy. Never disable certificate validation.

### Bring-up checklist (after reboot or if something is dead)
```
# 0. AEM instances up (launch.py, see above) and proxy up (detach.py ... proxy.mjs)
node video/scripts/build-demo-extension.mjs            # extension -> video/build/extension
node video/scripts/launch-chrome.mjs [--fresh]         # detached Chrome + host-resolver rules + pins the Orbit icon (Preferences edited before launch)
ORBIT_ADMIN_PW=admin node video/scripts/seed-settings.mjs [--bare]   # settings (dark theme, dev mode, long-press, mappings)
ORBIT_ADMIN_PW=admin node video/scripts/login-all.mjs  # session cookies for the 4 authors
node video/scripts/dismiss-tours.mjs                   # closes AEM "Modes"/"Product Navigation" tour popups (once per author)
```
Health: `curl http://127.0.0.1:9333/json/version`; each author returns 200 for `/content/wknd/us/en/magazine.html` (with basic auth).

## How the video is made (tools and pipeline)
1. **Real browser, real input.** Chrome for Testing 158 (branded Chrome ignores `--load-extension`) launched by `launch-chrome.mjs` with the demo
   extension (`build-demo-extension.mjs` = normal build + host permissions granted in the manifest, because the optional-permission prompt is browser UI
   automation cannot click). Driven over the Chrome DevTools Protocol with a tiny dependency-free client (`lib/cdp.mjs`, Node 22 `WebSocket`).
   Mouse moves/clicks/keys are real `Input.dispatch*` events, so hover fans, long-press, drag and shortcuts behave exactly like for a user.
2. **Capture.** Screen mode (default, see "Screen mode" below): the real Chrome window is recorded from the display with ffmpeg avfoundation, 1920x1080 / 60 fps, cropped to the window; a magenta flash is the sync marker. (`ORBIT_SCREEN=0` = legacy CDP `Page.startScreencast`, page only.)
3. **Overlay.** `lib/overlay.mjs` injects (into the browser top layer via `popover`) the animated cursor, click ripple, top-aligned chapter title card and No URL pill any more (the real address bar shows the URL).
   a bottom-left tag; it is `pointer-events:none` so it never changes behaviour.
4. **Voice.** `edge-tts` 7.3.1 (Python, Microsoft neural voices; needs internet; it is only used while building the video and is not part of the extension, which makes no external calls).
   Voice: **A = `en-US-ChristopherNeural`, rate +3 %** is the default for NEW chapters (Ch5+); chapters 00-04 were recorded with **B = `en-US-AndrewMultilingualNeural`, rate -4 %** (`en-US-AndrewNeural` returns NoAudioReceived). See "VOICE DECISION" below. ffprobe measures each line; `runSteps` runs the
   action and the line together and waits for the longer; `mux` places each line at its recorded time, `loudnorm` to -16 LUFS, AAC 192 k.
5. **Tools installed:** ffmpeg 9.0.2 (`/opt/homebrew/bin`, after `brew link ca-certificates`), Node 22, Python 3 with `edge_tts`, Java (for AEM).
   MCP/Chrome-DevTools MCP is NOT used for recording (the screencast API above is); it was only handy for ad-hoc inspection.
6. **Per chapter:** write `video/chapters/NN-name.mjs` (copy `01-orb.mjs`) -> run detached -> `verify-chapter.mjs` -> view at most one small contact sheet.
7. **Assembly (Ch 12):** concat the verified `video/out/NN-*.mp4` with ffmpeg (same codec/size/fps, so `-c copy` works with the concat demuxer),
   add title/outro cards, then cut the ~3 min highlights from marked sections.

## Tooling (all in `video/`)
- `lib/recorder.mjs` - CDP recorder. Real mouse/keyboard events; `moveTo/hover/click/clickHere/hold/drag/key/type`,
  `title/untitle/tag` overlays, `pageIds()+follow()` to follow a tab the extension opens, `back()`, `goto()`, `render()`.
  **Viewport is pinned to exactly 1920x1080** (`#pin`) at tab setup, `start()` and `back()`; any screencast frame whose
  `deviceWidth/deviceHeight` is not 1920x1080 is discarded and re-pinned (`badFrames` is printed by `stop()`).
- `lib/narrate.mjs` - edge-tts (default voice A `en-US-ChristopherNeural`, rate +3%; B = `ORBIT_VOICE=en-US-AndrewMultilingualNeural ORBIT_RATE=-4%`), cached in
  `video/work/tts/`; retries up to 6x (service randomly answers NoAudioReceived). `runSteps` starts action and voice together;
  `mux` mixes lines at their recorded offsets, loudnorm, `apad` so audio is never shorter than video.
- `lib/chapter.mjs` - `runChapter(id, { url, setup, steps })`: pre-synthesises all voice lines, records, renders
  `video/out/<id>.silent.mp4`, muxes `video/out/<id>.mp4`. On failure writes `video/work/<id>-fail.png`.
- `lib/cdp.mjs` - CDP client; `extensionWorker()` falls back to an open extension page when the MV3 worker is asleep.
- `scripts/detach.py`, `login-all.mjs`, `dismiss-tours.mjs`, `seed-settings.mjs`, `launch-chrome.mjs`, `build-demo-extension.mjs`.
- Extension DOM ids: `#asp-bar #asp-logo-btn #asp-orb-fan`; leaves `#asp-mini-{edit,view,live,props}-btn #asp-orb-env-btn
  #asp-jcr-btn #asp-sites-btn`; env sub-leaves `.asp-orb-envopt[data-env=...]`; toolbar `#asp-tier-btn #asp-publish-menu-btn
  #asp-locales-btn #asp-sync-btn #asp-inspect-btn #asp-more-btn #asp-palette-btn #asp-status-pill #asp-env-chip`.
  Options page `src/options/options.html`: `#save`, `.tab[data-tab=...]`, `#classicBar #summonOnLongPress #enableDevMode`.
- **Popup = the REAL toolbar popup** (`lib/popup.mjs`): `const pop = await openPopup(rec)` does a real OS click (Quartz event via `osascript`) on the pinned Orbit icon at screen (1771, 92), so the popup drops down over the page exactly as for a user; `rec.tab` then points at the popup target, so `rec.click/type/waitFor` and the `toolbar.mjs` helpers work inside it, with the overlay cursor + ripple injected. Finish with `await pop.close()` (restores `rec.tab` and the page cursor). Rules: no tab, no zoom, no black screen, no URL stub; never call `Page.bringToFront`, `rec.goto`, `rec.follow` or `rec.back` while the popup is open (it closes on blur); the popup is ~365x567 px, so a long panel needs `scrollIntoView` before clicking (Ch4 "Show diff" case). Needs the extension PINNED (see below), Chrome in front, Mac not in use. `ORBIT_ICON_X/Y` override the icon position.

### Screen mode = THE STANDARD for every chapter
`lib/recorder.mjs` records the real Chrome window (tab strip, address bar with padlock, pinned extension icon, new tabs opening, the real popup) from the display with `ffmpeg -f avfoundation` at 1920x1080 / 60 fps. It is the default; `ORBIT_SCREEN=0` gives the legacy page-only CDP screencast (do not use for new work). The old URL pill is gone (the real address bar shows the URL); `showUrl(...)` / `api.url()` no longer exist and silently do nothing.
- Run as usual: `python3 video/scripts/detach.py /tmp/x.log node video/chapters/NN-name.mjs` -> `video/out/NN-name.mp4`; verify with `verify-chapter.mjs NN-name` (it detects `capture.mp4`).
- Needs: Screen Recording permission for the terminal/app running node; the Chrome window in front and unobscured on the captured display; do not use the Mac during a recording. `ORBIT_SCREEN_DEVICE` = avfoundation index (default `1`).
- **Extension must be pinned**: `launch-chrome.mjs` now writes `extensions.pinned_extensions` into the profile Preferences BEFORE launching Chrome (id from `video/work/extension-id.txt`). On an already running Chrome, kill it and relaunch via the bring-up checklist (the pin only takes effect at start-up).
- How it works: `open()` closes every other tab, sizes the window via `Browser.setWindowBounds` (window at 0,30); `start()` launches ffmpeg, then flashes the page magenta for 450 ms at a known wall-clock time; `render()` finds the flash, trims and re-encodes (CRF 17, 60 fps) so voice cues stay in sync. The `capture.mp4` files are large: delete them after a verified render.
- `lib/cdp.mjs` caches the extension id in `video/work/extension-id.txt` (screen mode closes all extension pages). If `extensionWorker()` cannot find the worker: `curl -X PUT "http://127.0.0.1:9333/json/new?chrome-extension://<id>/src/options/options.html"`.
- **Before every run:** `curl -s http://127.0.0.1:9333/json/list` must show about 1 page tab (close a leftover popup tab via `/json/close/<id>`).

### RE-RECORD STATUS (standing rule: every chapter is recorded in screen mode with the real popup)
ALL chapters 00, 01, 01b, 02, 03, 04 are now recorded in screen mode (real window + real popup). Nothing is left to re-record. Resets still needed before any re-record: Ch2 needs `demo-content.py` + unpublish `toast-demo` (`curl -u admin:$ORBIT_ADMIN_PW -X POST http://127.0.0.1:4512/bin/replicate.json -d cmd=Deactivate -d path=/content/wknd/us/en/orbit-demo/toast-demo`); Ch3 needs `ch3-content.py`; 00, 01, 01b, 04 none. The old page-only frame dirs were deleted.

## VOICE DECISION (open - decide AFTER all chapters are recorded, not before)
Two voice-over settings are in play. The user wants to compare them on the finished set and then choose one for the final video:
- **A (new default, Ch5+):** `en-US-ChristopherNeural`, rate +3 % - the voice of the old `aem-orbit-comprehensive-walkthrough.mp4` the user found smoother (about 127 wpm, faster).
- **B (Ch00-04 as recorded):** `en-US-AndrewMultilingualNeural`, rate -4 % (about 102 wpm, slower).
- **Decision task (after Ch11, before/with Ch12 assembly):** listen to a chapter in both voices and ask the user to choose. If A wins: re-record 00, 01, 01b, 02, 03, 04 with the default env (needs the resets listed under RE-RECORD STATUS, about 22 min of footage; first check whether the saved cue times allow re-voicing the existing footage without re-recording - not yet checked). If B wins: re-record Ch5+ with `ORBIT_VOICE=en-US-AndrewMultilingualNeural ORBIT_RATE=-4%`. Third option if A feels rushed: Christopher at 0 %. Until then do NOT re-record Ch00-04 for voice reasons, and keep their current mp4s.
- Sample sentence rendered in three variants: `video/work/voice-test/` (A, B, C = Christopher -4 %, D = Christopher 0 %).
- Why A may sound better (not heard, measured): longer scene paragraphs (12 scenes of ~20 s, played back to back, 27 pauses in 252 s) vs our 21-26 short clips per chapter (46 pauses in Ch2); faster pace; steadier level (LRA 2.9 vs 7.4 LU).


## Status
| # | Chapter | File | State |
|---|---|---|---|
| 0 | Frame-size fix verification | `video/work/size-test.mjs` | DONE - 1673/1673 frames 1920x1080 over 4 new-tab follow/back cycles |
| 0b | Intro: cross-browser & 4-Persona architecture (Author, QA, Dev, Custom) | `chapters/00-intro.mjs` | DONE (screen mode) - **v4**: `00-intro-v4.mp4` (96.8s, 5805 frames, 8.19 MB, `v3` preserved) |
| 1 | Orb & Persona Fan: QA vs Custom leaves, env switch, Expand/Collapse JCR | `chapters/01-orb.mjs` | DONE (screen mode) - **v4**: `01-orb-v4.mp4` (172.7s, 10363 frames, 15.47 MB, `v3` preserved) |
| 1b | Position drag/persist across edges, long-press summon + Esc, Orb vs Mini-Bar | `chapters/01b-orb-position.mjs` | DONE (screen mode) - **v4**: `01b-orb-position-v4.mp4` (129.9s, 7794 frames, 11.09 MB, `v3` preserved) |
| 2 | Toolbar & Personas: More-menu QA switch, tiers, Shift/Cmd-click, scrollable 20-locale MSM list, toasts | `chapters/02-toolbar.mjs` | DONE (screen mode) - **v4**: `02-toolbar-v4.mp4` (210.5s, 12628 frames, 19.86 MB, `v3` preserved) |
| 3 | Authoring & replication: pre-flight, preview, lock via Cmd+K, tree dry run, bulk, delete, Prod Guard | `chapters/03-authoring.mjs` | DONE (screen mode) - **v4**: `03-authoring-v4.mp4` (258.8s, 15526 frames, 19.03 MB, `v3` preserved) |
| 4 | Developer tools: Expand/Collapse JCR + copy path, Stage diff, component/DAM/CFM/cache inspectors, links | `chapters/04-devtools.mjs` | DONE (screen mode) - **v4**: `04-devtools-v4.mp4` (349.4s, 20963 frames, 33.41 MB, `v3` preserved) |
| 5 | Content sync: pull/push safety, pre-sync diff, version backup, instant Undo, Prod CDN -> Local creation | `chapters/05-sync.mjs` | DONE (screen mode) - **v4**: `05-sync-v4.mp4` (92.7s, 5562 frames, 8.30 MB, `v3` preserved) |
| 6 | SEO & a11y audit: 92/100 vs 32/100, duplicate DOM IDs, broken/unsized images, 404 links, Copy/Export JSON | `chapters/06-seo.mjs` | DONE (screen mode) - **v4**: `06-seo-v4.mp4` (82.2s, 4933 frames, 8.47 MB, `v3` preserved) |
| 7 | Popup Workspace: header Persona/Env switchers, QA Readiness, Diff Back/Copy, bookmarks, CSV, F&R, flush | `chapters/07-workspace.mjs` | DONE (screen mode) - **v4**: `07-workspace-v4.mp4` (108.3s, 6500 frames, 11.11 MB, `v3` preserved) |
| 8 | EDS & Universal Editor: deduplicated Copy URLs, `.aem.page`/`.aem.live` query retention, UE canvas | `chapters/08-eds.mjs` | DONE (screen mode) - **v4**: `08-eds-v4.mp4` (56.0s, 3361 frames, 3.72 MB, `v3` preserved) |
| 9 | Enterprise & policy: Brand Profiles CRUD, `allowedPersonas`, `enforceSessionAuthOnly`, `controlPolicy`, `lockConfiguration` | `chapters/09-enterprise.mjs` | DONE (screen mode) - **v4**: `09-enterprise-v4.mp4` (71.1s, 4266 frames, 8.08 MB, `v3` preserved) |
| 10 | Settings Console: dynamic 4-Persona cards, Clone to Custom, Brand Profiles, 5-tier diagnostics, Toolbar Editor | `chapters/10-settings.mjs` | DONE (screen mode) - **v4**: `10-settings-v4.mp4` (120.0s, 7197 frames, 17.58 MB, `v3` preserved) |
| 11 | Keyboard shortcuts: `Option+Shift+K`, `Cmd+K` keyword search ranking (`audit`, `jcr`), A-Z jumps, `Esc` | `chapters/11-shortcuts.mjs` | DONE (screen mode) - **v4**: `11-shortcuts-v4.mp4` (58.5s, 3509 frames, 5.97 MB, `v3` preserved) |
| 12 | Assemble v4: 13-chapter concat, 3.2-min highlights, 55s teaser, posters, tutorial player, E2E + unit checks | `video/scripts/assemble-walkthrough.mjs` | DONE - `orbit-for-aem-walkthrough-v4.mp4` (1806.80s / 30.11 min, 178.6 MB, 13 markers), `orbit-for-aem-highlights-v4.mp4` (192.02s, 21.0 MB), `orbit-for-aem-teaser-1min-v4.mp4` (55.00s, 6.1 MB) |

Test content still to create under `/content/wknd/us/en/orbit-demo` (Local + other envs where needed): parent + 3-4 children (tree
publish/dry run); page referencing an unpublished page and asset (pre-flight); lock/unlock + safe-delete pages; page with a
differing `jcr:content` property (sync/diff/compare); 5-6 paths for bulk; MSM live copies; SEO good/bad pages; CFM + DAM examples.

## Coverage map (summary; the authoritative per-item list is `video/FEATURES.md`)
1 Orb/HUD (orb, caption, fan, 7 leaves, env sub-leaves, summon, drag/reset, style toggle) -> 1, 1b
2 Toolbar/navigation (pill, tiers, cross-env, Shift/Cmd click, MSM/locales, status panel, toasts) -> 2
3 Authoring/governance (publish, pre-flight, preview, lock, tree, bulk, delete, Prod Guard) -> 3
4 Developer tools (inspectors, JCR tree, sync, overlays, highlight, DAM, CFM, cache headers, deep links, hard reload) -> 4, 5
5 SEO/a11y -> 6      6 Popup workspace -> 7      7 EDS/Universal Editor -> 8
8 Enterprise/policy/privacy -> 9      9 Settings matrix -> 10      10 Keyboard shortcuts -> 11

## Chapter script pattern
Copy `chapters/01-orb.mjs`. Each step is `{ say: '<narration>', do: async () => {...} }`; `rec.title()` once at the start, leaf/new-tab
actions use `before = await rec.pageIds(); await rec.click(sel); await rec.follow(before); ...; await rec.back()`. Keep acronyms
jointed without spaces ("AEM", "JCR", "CDN", "SEO", "DAM") per user decision for all chapters. Log the URL each click opens.
Per-chapter acceptance: (1) log shows no "step failed", (2) `ffprobe` says 1920x1080 h264 60 fps + aac, audio length == video length,
(3) run `node video/scripts/verify-chapter.mjs <id>` -> must print OK (checks codec/size/fps, audio length, every frame 1920x1080), (4) at most one small contact sheet viewed.

## Last session notes
- **Full v4 Regeneration & Feature Expansion (`00-intro-v4` through `11-shortcuts-v4`, Assembly, Highlights & Teaser):**
  - Authored and recorded all 13 v4 chapters via unversioned script paths (`video/chapters/00-intro.mjs` .. `video/chapters/11-shortcuts.mjs`, removing legacy `*-v2.mjs`/`*-v3.mjs` scripts) in 1920x1080 / 60fps screen mode using Voice A (`en-US-ChristopherNeural` +3%) with jointed acronyms and initial ~3.5s title pills:
    - `00-intro-v4.mp4`: `96.8s` (`5805` frames, `8.19 MB`)
    - `01-orb-v4.mp4`: `172.7s` (`10363` frames, `15.47 MB`)
    - `01b-orb-position-v4.mp4`: `129.9s` (`7794` frames, `11.09 MB`)
    - `02-toolbar-v4.mp4`: `210.5s` (`12628` frames, `19.86 MB`)
    - `03-authoring-v4.mp4`: `258.8s` (`15526` frames, `19.03 MB`)
    - `04-devtools-v4.mp4`: `349.4s` (`20963` frames, `33.41 MB`)
    - `05-sync-v4.mp4`: `92.7s` (`5562` frames, `8.30 MB`)
    - `06-seo-v4.mp4`: `82.2s` (`4933` frames, `8.47 MB`)
    - `07-workspace-v4.mp4`: `108.3s` (`6500` frames, `11.11 MB`)
    - `08-eds-v4.mp4`: `56.0s` (`3361` frames, `3.72 MB`)
    - `09-enterprise-v4.mp4`: `71.1s` (`4266` frames, `8.08 MB`)
    - `10-settings-v4.mp4`: `120.0s` (`7197` frames, `17.58 MB`)
    - `11-shortcuts-v4.mp4`: `58.5s` (`3509` frames, `5.97 MB`)
  - Showcased all new capabilities in v4: 4 Workspace Personas (`Author`, `QA`, `Developer`, `Custom`) across Settings/Orb/Toolbar/Popup/Policies (`allowedPersonas`, `personaCloneCustom`), viewport-bounded scrollable menus (`fitFloatingBox` with 20-locale MSM list, JCR, Audit, Palette), Expand/Collapse All JCR buttons + click-to-copy paths, Audit duplicate DOM IDs / broken images / unsized image dimensions / Copy JSON, Popup header Persona/Env switchers & QA Readiness + Diff Back/Copy, deduplicated EDS/UE links, Multi-Site Brand Profiles CRUD, Command Palette label-over-keyword ranking (`src/content/content-script.js`), and cross-browser Chrome/Edge/Firefox MV3/Safari architecture.
  - Assembled canonical v4 deliverables via `video/scripts/assemble-walkthrough.mjs` and `video/scripts/build-teaser.mjs` (orchestrated via `video/scripts/record-all.mjs`):
    - Walkthrough: `video/out/orbit-for-aem-walkthrough-v4.mp4` (+ `orbit-for-aem-walkthrough.mp4`) — `1806.80s` (`30.11 min`), `178.6 MB`, 13 embedded chapters.
    - Highlights: `video/out/orbit-for-aem-highlights-v4.mp4` (+ `orbit-for-aem-highlights.mp4`) — `192.02s` (`3.20 min`), `21.0 MB`.
    - Teaser: `video/out/orbit-for-aem-teaser-1min-v4.mp4` (+ `orbit-for-aem-teaser-1min.mp4`) — `55.00s`, `6.1 MB`.
  - Updated `docs/tutorial/tutorial.js` (`*-v4.mp4`, updated topics & durations), `docs/tutorial/README.md`, `docs/tutorial/posters/*.jpg`, `video/FEATURES.md`, `video/HANDOFF.md`, and `README.md`.
- **Chapter 03 Re-record (Bulk Publish Dry Run Visibility Fix) & Final Assembly:**
  - **Chapter 03 Re-record (`03-authoring-v2.mp4`, 342.1s, 20,529 frames @ 60fps, 1080p)**:
    - **Bulk Dry Run Result Visibility Fix**: In `video/chapters/03-authoring.mjs` (originally `v2`), updated the step after clicking `#bulkDryRun` to programmatically scroll the popup window, `#mainPanel`, `#panelContent`, and `#bulkDryRunResults` completely down to the bottom (`r.scrollIntoView({ block: 'end' })`), then moved mouse directly to the dry run results row, making the entire dry run preview table (50 pages, draft badges) 100% visible on screen.
    - Also added `scrollIntoView` for `#bulkInput` in `pasteBulk` and `#bulkPublish` to ensure buttons remain centered and accessible before subsequent actions.
    - Updated `src/popup/popup.js` line 815 so `#bulkDryRunResults` automatically calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
    - Applied the standard title pill rule: displayed for ~3.5s and dismissed cleanly via `await rec.untitle()`.
    - Verified OK via `node video/scripts/verify-chapter.mjs 03-authoring-v2`. Visual inspection of contact sheet confirmed dry run preview list and badges are clearly visible.
  - **Re-assembly of Walkthrough & Highlights (`video/scripts/assemble-walkthrough.mjs`)**:
    - **Walkthrough Video**: `video/out/orbit-for-aem-walkthrough.mp4` (2,686.2s / 44.77 min, 228.2 MB, 1920x1080 @ 60fps, AAC 48kHz). 13 native MP4 chapter markers embedded.
    - **Highlights Reel**: `video/out/orbit-for-aem-highlights.mp4` (198.0s / 3.3 min, 14.5 MB, 1920x1080 @ 60fps).
    - Re-extracted poster `docs/tutorial/posters/03-authoring.jpg`.
    - All 266 unit tests passing (`npm test`), 0 eslint errors.
- **Chapter 00 Re-record (Title Pill Rule Fix) & Final Assembly:**
  - **Chapter 00 Re-record (`00-intro-v2.mp4`, 98.9s, 5,933 frames @ 60fps, 1080p)**:
    - Fixed chapter title card duration in `video/chapters/00-intro.mjs` (originally `v2`). Previously passed `ms = 0` holding the pill across steps 1 through 6 (~80 seconds). Changed to standard pattern: `await rec.title('Chapter 0 · <b>Introduction</b> &amp; Architecture', 'Author, publish, and CDN in one unified floating control surface')` displayed for ~3.5s, then dismissed via `await rec.untitle()`.
    - Verified OK via `node video/scripts/verify-chapter.mjs 00-intro-v2`. Visual inspection of 4x3 contact sheet confirmed title card appears only in the initial 3.5 seconds and is 100% absent across all subsequent frames.
  - **Re-assembly of Walkthrough & Highlights (`video/scripts/assemble-walkthrough.mjs`)**:
    - **Walkthrough Video**: `video/out/orbit-for-aem-walkthrough.mp4` (2,685.1s / 44.75 min, 227.9 MB, 1920x1080 @ 60fps, AAC 48kHz). 13 native MP4 chapter markers embedded.
    - **Highlights Reel**: `video/out/orbit-for-aem-highlights.mp4` (198.0s / 3.3 min, 14.5 MB, 1920x1080 @ 60fps). Voiceover consistently uses Voice A (`en-US-ChristopherNeural` at +3% rate) with jointed acronyms across all chapters.
    - Re-extracted poster `docs/tutorial/posters/00-intro.jpg`.
    - 266/266 tests passing (`npm test`), 0 eslint errors.
- **User Feedback Re-records & Final Walkthrough Assembly (Chapters 7, 8, 9 & Assembly):**
  - **Chapter 7 Re-record (`07-workspace-v2.mp4`, 198.0s, 11,881 frames)**:
    - Fixed popup result section visibility: for compare environments and version operations, updated results handling with programmatic bottom scrolling (`window.scrollTo({ top: document.body.scrollHeight })` and `#panelContent.scrollTo({ top: ... })`) so that all environment comparison rows, property diffs, version history timelines, and version diff tables scroll smoothly and completely into full view down to the mouse action point.
    - Verified OK via `node video/scripts/verify-chapter.mjs 07-workspace-v2`.
  - **Chapter 8 Re-record (`08-eds-v2.mp4`, 167.8s, 10,069 frames)**:
    - Fixed popup Copy URLs result section visibility: updated `showPanelResults` and `popCopyRow` with `scrollIntoView({ block: 'center' })` and full container scrolling so that the Universal Editor row and its copy button are centered and 100% visible before mouse clicks.
    - Ensured `environments.dev` registers `previewHost` (`https://main--wknd--hlxsites.aem.page`) and `dispatcherHost` (`https://main--wknd--hlxsites.aem.live`) so content scripts cleanly mount on EDS domains.
    - Verified OK via `node video/scripts/verify-chapter.mjs 08-eds-v2`.
  - **Chapter 9 Bug Fix & Re-record (`09-enterprise-v2.mp4`, 136.7s, 8,201 frames)**:
    - **Product Code Bug Fix (`src/options/options.js`)**: Fixed "Configuration is managed by company administrator..." policy banner placement. Previously prepended before `.topbar` which rendered behind the sticky topbar due to negative margin; changed to `topbar.after(banner)` with clean margin (`margin: 0 0 20px; box-sizing: border-box;`), eliminating cropping and text overlap.
    - **Auth Section Centering**: Added smooth centered scrolling to `.auth-selector[data-env="dev"]` in `video/chapters/09-enterprise-v2.mjs` during the policy explanation, making all disabled auth options, radio buttons, and lock tooltips fully visible.
    - Verified OK via `node video/scripts/verify-chapter.mjs 09-enterprise-v2`.
  - **Complete Walkthrough & Highlights Re-assembly (`video/scripts/assemble-walkthrough.mjs`)**:
    - **Walkthrough Video**: `video/out/orbit-for-aem-walkthrough.mp4` (2,685.0s / 44.75 min, 228.0 MB, 1920x1080 @ 60fps, AAC 48kHz). Embedded 13 native MP4 chapter markers (00 through 11) for quick player seeking.
    - **Highlights Reel**: `video/out/orbit-for-aem-highlights.mp4` (198.0s / 3.3 min, 14.5 MB, 1920x1080 @ 60fps). Voiceover across all 13 chapters, the complete walkthrough, and the highlights reel consistently uses Voice A (`en-US-ChristopherNeural` at +3% rate) with jointed acronyms.
    - Generated 13 chapter posters in `docs/tutorial/posters/` and updated `docs/tutorial/tutorial.js` with all durations and metadata.
    - All 266 unit tests passing (`npm test`), 0 eslint errors.
- **Chapter 12 Completion (Assembly, Full Walkthrough & Highlights):**
  - **Full Walkthrough Video**: `video/out/orbit-for-aem-walkthrough.mp4` (2685.4s / 44.76 min, 227.7 MB, 1920x1080 @ 60fps, stereo AAC 48kHz).
  - **Embedded Chapter Metadata**: Embedded 13 official MP4 chapter markers (00 through 11) with exact millisecond bounds directly into the MP4 container for native playback scrubbing in QuickTime, VLC, and video players.
  - **Executive Highlights Reel**: `video/out/orbit-for-aem-highlights.mp4` (198.0s / 3.3 min, 14.5 MB, 1920x1080 @ 60fps) featuring high-impact clips covering the Orb HUD, toolbar navigation, pre-flight publishing, JCR tree, cross-environment content sync, Command Palette, and zero-trust security.
  - **Docs & Tutorial Updates**: Generated 13 high-resolution 800x450 poster frames in `docs/tutorial/posters/`, updated symlinks in `docs/tutorial/videos/`, and expanded `docs/tutorial/tutorial.js` with comprehensive chapter topics and durations for all 13 chapters.
  - **Verification**: `npm test` passed 266/266 tests (0 failures). `npx eslint video src` clean. All items in `video/FEATURES.md` ticked `[x]`.

- **Chapter 11 Completion (Keyboard Shortcuts & Command Palette):**
  - **Video Output**: `video/out/11-shortcuts-v2.mp4` (92.8s, 5568 frames @ 60fps, 1920x1080, Christopher Neural +3%, jointed acronyms, styled blue pill ~3.5s then untitle).
  - **Coverage**: All 5 keyboard shortcut features in Section 10:
    1. Alt+Shift+K (Option+Shift+K): Instant collapse of toolbar into Orb and expansion back into full toolbar.
    2. Cmd+K / Ctrl+K: Instant summoning of the Command Palette modal overlay across any AEM page.
    3. Live Fuzzy Search: Fast real-time action filtering (`pub` for publishing/preview, `jcr` for JCR inspector/path/JSON).
    4. Arrow Up/Down & Enter Navigation: Seamless keyboard selection and immediate execution (launched JCR Node Inspector).
    5. Menu Navigation & A-Z Letter Jump + Universal Escape: Arrow keys and type-ahead letter jumping (`c` -> Copy URL, `d` -> Developer links / Delete page), universal Escape dismissal of menus, inspectors, and modal dialogs.
  - **Verification**: Verified OK via `node video/scripts/verify-chapter.mjs 11-shortcuts-v2`. Raw capture frames deleted. All 5 Ch11 items in `video/FEATURES.md` ticked `[x]`.
  - **Next Chapter**: Chapter 12 (Assembly & Highlights: concatenate all 13 chapters into the complete full walkthrough video + 3-minute highlights cut, full test & lint verification).

- **Chapter 10 Completion (Settings Options Console & Complete Matrix):**
  - **Video Output**: `video/out/10-settings-v2.mp4` (200.1s, 12006 frames @ 60fps, 1920x1080, Christopher Neural +3%, jointed acronyms, styled blue pill ~3.5s then untitle).
  - **Coverage**: Full Options console configuration matrix across 13 distinct feature areas:
    1. Header & Quick Setup: Save button, unsaved-changes indicator, light/dark/auto theme switcher, settings JSON export/import and shareable setup URL menu.
    2. Quick Setup Card: 3-step first-run onboarding (tier selector, author URL, auth method, and connection test).
    3. Per-Environment Setup: Local, Dev, Stage, Production host panels and custom environment provisioning (`#btn-add-env`).
    4. Granular Authentication & Diagnostics: Session SSO, Basic, Bearer, None; live CSRF token verification and real-time millisecond ping (`data-test="dev"`).
    5. Environment Governance Toggles: Protected environment toggle, Apply URL mapping to Publish / Preview, Omit .html extension on Dispatcher.
    6. General Configuration & Path Mapping: JCR Content Root (`/content/wknd`), App Name (`wknd`), Universal Editor IMS org, Request timeout stepper (5-120s), multi-line Dispatcher URL mappings.
    7. Environment Precedence Order: Drag-and-drop toolbar display ranking and sync hierarchy.
    8. Enterprise Safety Guards: Confirm delete, confirm publish, upward sync, desktop notifications, session-only in-memory credential storage.
    9. Toolbar Visibility: Per-tier injection (Author, Publish, Dispatcher), Option+Shift+K toggle, last-modified timestamp pill.
    10. Collapsed Bar Style: Classic horizontal mini-bar vs floating radial orb, long-press pointer summoning.
    11. Toolbar Button Layout Editor: Interactive drag/reorder button customization across Mini Bar (up to 6) and Expanded Bar (up to 14), More menu overflow, layout reset.
    12. Developer Mode Matrix: Master toggle, granular switches for JCR inspector, overlays, component highlighting, component inspector, developer links, hard reload, page delete, content sync.
    13. Data Management: Reset to defaults, clear all data.
  - **Verification**: Verified OK via `node video/scripts/verify-chapter.mjs 10-settings-v2`. Raw capture frames deleted. All 13 Ch10 items in `video/FEATURES.md` ticked `[x]`. Demo settings re-seeded via `seed-settings.mjs`.
  - **Next Chapter**: Chapter 11 (Keyboard Shortcuts: Cmd+K palette fuzzy search, Alt+Shift+K toggle, Esc dismiss, arrows+Enter navigation).

- **Chapter 9 Completion (Enterprise Governance & Managed Policies):**
  - **Video Output**: `video/out/09-enterprise-v2.mp4` (136.6s, 8193 frames @ 60fps, 1920x1080, Christopher Neural +3%, jointed acronyms, styled pill with ~3.5s auto-dismiss).
  - **Coverage**: Multi-site brand profiles (resolves contentRoot, appName, urlMappings dynamically), zero-trust security architecture (no telemetry, no analytics, no external calls, credentials isolated inside service worker), `enforceSessionAuthOnly` (forces browser SAML session cookies, disables basic/bearer credentials with policy tooltips), `controlPolicy` (centrally disables delete, sync, and developerMode globally, restricts prod publish), and `lockConfiguration` (read-only administrator policy banner, disabled inputs and disabled save button). Live verification on author page shows restricted actions removed from toolbar menus.
  - **Policy Simulation & Reliability**: Implemented `_managedShim` in `src/shared/aem-api.js` (supported via `chrome.storage.local._managedShim`). Added dynamic CDP dialog auto-acceptance (`Page.javascriptDialogOpening`) in `video/lib/recorder.mjs` and `setDirty(false)` resets in `video/chapters/09-enterprise-v2.mjs` to eliminate beforeunload navigation prompt freezes.
  - **Verification**: Verified OK via `node video/scripts/verify-chapter.mjs 09-enterprise-v2`. Raw capture frames deleted. All 5 Ch9 items in `video/FEATURES.md` ticked `[x]`.
  - **Next Chapter**: Chapter 10 (Settings matrix: Options console complete configuration matrix, quick setup, themes, export/import JSON, diagnostics, latency, custom environments).

- **Chapter 6, 7 & 8 Completion & Re-record:**
  - **Heading Pill Standard Enforced**: All chapters (6, 7, 8 and upcoming) use styled accent text and description subtitle (`rec.title('Chapter N · <b>Bold Title</b> ...', 'Subtitle description')`). The pill is displayed only for the initial ~3.5s and dismissed cleanly via `await rec.untitle()`. It does not stick across frames.
  - **Popup Action Results Scrolling**: In Chapter 7, all extension popup action screens (`#compareBtn`, `#listsBtn`, `#createVersionBtn`, `#versionsBtn`, `#urlVariantsBtn`, `#quickLinksBtn`, `#actionLogBtn`, `#findReplaceBtn`, `#dispatcherFlushBtn`) now call `showPanelResults(rec)` or `showDialog(rec)` to smoothly scroll the action result / dialog into center view so no results are cut off by the 567px popup fold.
  - **Chapter 6 (v2)**: Verified OK: 172.9s video, 10374 frames, Christopher Neural (+3%), jointed acronyms, styled pill with auto-dismiss, good page (92/100) vs bad page (32/100), 404 broken link detection, zero desktop glitch / zero hover pills.
  - **Chapter 7 (v2)**: Verified OK: 198.0s video, 11881 frames, Christopher Neural (+3%), jointed acronyms, styled pill with auto-dismiss, all action panels & dialogs scrolled smoothly into view.
  - **Chapter 8 (v2)**: Verified OK: 168.3s video, 10100 frames, Christopher Neural (+3%), jointed acronyms, styled pill with auto-dismiss, global CDP mock interceptor for EDS preview/live and Universal Editor canvas navigation.
  - **Next Chapter**: Chapter 9 (Enterprise & policy: managed policies `lockConfiguration`, `enforceSessionAuthOnly`, `controlPolicy`, and brand profiles).

- **Chapter 6 (v2) Completion (latest):**
  Authored `video/chapters/06-seo-v2.mjs` and seeded test content via `video/env/ch6-content.py`:
  - `good-page` (`/content/wknd/us/en/orbit-demo/seo/good-page`): healthy title (51 chars), description (151 chars), absolute canonical link, single H1, clean H1->H2->H3 hierarchy, image with alt attribute, 19 valid same-origin internal links -> Score 92/100 (green health badge).
  - `bad-page` (`/content/wknd/us/en/orbit-demo/seo/bad-page`): short title (3 chars), short description (9 chars), robots noindex/nofollow tag, duplicate H1s, skipped heading hierarchy (H2 -> H4), image without alt attribute, unnamed button, unlabelled input, and a broken internal link (`/content/wknd/us/en/orbit-demo/seo/non-existing-broken-link.html`) -> Score 32/100 (red alert badge).
  - Configured AEM LinkChecker OSGi transformer (`linkcheckertransformer.disableChecking: true`) in `ch6-content.py` so broken relative `<a>` tags are preserved in rendered HTML on Author mode, enabling Orbit's client-side audit engine to catch and report 404 links.
  - Enhanced `video/lib/recorder.mjs` and `video/lib/popup.mjs` with dynamic screen layout detection (`getScreenLayout` via JXA), automatically detecting displays with width >= 1920 (e.g. 3440x1440 external display vs 1728x1117 laptop display), placing Chrome at `WINDOW_LEFT` and capturing the matching avfoundation device index, with `parkPhysicalMouse()` off-screen at `WINDOW_LEFT + 2500, 500`.
  - Recorded in full 1080p screen mode (real Chrome window, address bar, tab strip, real popup/toolbar):
    - Output: `video/out/06-seo-v2.mp4` (172.4s duration, 10342 frames, sizes `{"1920x1080": 10342}`, audio/video in perfect sync).
    - Verified OK via `node video/scripts/verify-chapter.mjs 06-seo-v2`.
    - Visual inspection of 2x2 contact sheet confirmed crystal-clear rendering of audit panels, passing/failing checks, 404 URL details, and zero hover pills / zero second cursors.
    - All 4 Chapter 6 checkboxes in `video/FEATURES.md` ticked. NEXT: Chapter 7 (Popup Workspace).
- **Full v2 Regeneration Session across all generated chapters (00, 01, 01b, 02, 03, 04, 05 - latest, user request):**
  User requested regenerating chapters with a new voice (Voice A `en-US-ChristopherNeural`, +3%), enriched explanation, separate `-v2` filenames to preserve every original file untouched, and **jointed acronyms** without spaces ("AEM", "JCR", "CDN", "SEO", "DAM", "Touch UI", "QA", "CRXDE", "ID", "WCM", "MSM", "CFM").
  All seven chapters were authored, recorded in full 1080p screen mode (real Chrome window, address bar, tab strip, real popup), verified, and temporary raw capture files cleaned up:
  (1) **00-intro-v2.mp4** (`chapters/00-intro-v2.mjs`): 7 voice lines, 98.8s duration, 5928 frames (1920x1080 @ 60fps), audio/video in perfect sync. Richer overview of multi-environment AEM architectures, friction of distributed author/publish/CDN workflows, client-side zero-telemetry security, and deep diagnostics. Verified OK via `node video/scripts/verify-chapter.mjs 00-intro-v2`. Original `00-intro.mp4` preserved untouched.
  (2) **01-orb-v2.mp4** (`chapters/01-orb-v2.mjs`): 17 voice lines, 218.2s duration, 13092 frames (1920x1080 @ 60fps), audio/video in perfect sync. Deepens explanation for Orb anatomy (AEM helix spiral, CSS pulse), Touch UI editor jumping, `wcmmode=disabled` QA preview, Dispatcher/CDN domain mapping, parent folder Sites console navigation, in-page searchable JCR inspector with live filtering (`lastReplicated`, `template`), Developer Mode clipboard copy shortcut, and color-coded multi-environment switching. Verified OK via `node video/scripts/verify-chapter.mjs 01-orb-v2`. Original `01-orb.mp4` preserved untouched.
  (3) **01b-orb-position-v2.mp4** (`chapters/01b-orb-position-v2.mjs`): 15 voice lines, 165.8s duration, 9947 frames (1920x1080 @ 60fps), audio/video in perfect sync. Demonstrates drag-and-drop to all 4 corners and 4 edges with adaptive radial fan orientation, persistent viewport coordinates across page reloads, long-press summon at cursor, Escape key dismissal, and the Classic Mini-Bar toggle. Verified OK via `node video/scripts/verify-chapter.mjs 01b-orb-position-v2`. Original `01b-orb-position.mp4` preserved untouched.
  (4) **02-toolbar-v2.mp4** (`chapters/02-toolbar-v2.mjs`): 21 voice lines, 259.6s duration, 15573 frames (1920x1080 @ 60fps), audio/video in perfect sync. Deep dive into toolbar expansion, Tier switcher (Edit, View, Preview, Publish, CDN), Cross-environment switching (Local, Dev, Stage, Prod), Shift-click background replication, Cmd-click new tab navigation, MSM/Locales language master and live copy discovery, interactive status pill, and action toasts with instant Undo. Verified OK via `node video/scripts/verify-chapter.mjs 02-toolbar-v2`. Original `02-toolbar.mp4` preserved untouched.
  (5) **03-authoring-v2.mp4** (`chapters/03-authoring-v2.mjs`): 26 voice lines, 341.1s duration, 20465 frames (1920x1080 @ 60fps), audio/video in perfect sync. Demonstrates Quick Publish, Quick Unpublish, Preview tier replication, Pre-flight unreferenced asset detection and safe cancellation, WCM page locking/unlocking with padlock pill indicator, Tree Publish with dry-run page count and skipped inactive page calculation, Tree Unpublish, Bulk replication with rich body content (H1 title, description, teaser layout) on Dev & Prod bulk pages, error isolation on invalid paths and clean retry, safe deletion with 412 reference collision blocking, and Prod Guard typed confirmation (page name and batch page count). macOS Quartz mouse pointer parked dynamically outside the Chrome window (`x = 2500, y = 500`) in `recorder.mjs` and `popup.mjs`, completely eliminating Chrome's native hover tooltip from the toolbar and preventing bottom hover pills or double mouse cursors. Verified OK via `node video/scripts/verify-chapter.mjs 03-authoring-v2`. Original `03-authoring.mp4` preserved untouched.
  (6) **04-devtools-v2.mp4** (`chapters/04-devtools-v2.mjs`): 25 voice lines, 452.4s duration, 27142 frames (1920x1080 @ 60fps), audio/video in perfect sync. Clean recording without screen-switching interruptions. Demonstrates JCR tree inspector with real-time property/node filtering (`teaser_main`), multi-environment Stage vs Dev side-by-side comparison with diff, Component inspector card with CRXDE deep links and template path, DAM asset inspector card with image dimension/MIME metadata and asset editor jump, Content Fragment inspector card with CF model (`adventure`), variations (`master`), and live Headless JSON API endpoint, Developer links (CRXDE Lite, CRX Package Manager, Sling Model JSON, JCR content JSON, debug clientlibs, layout debug, clear debug), hard reload, CDN cache header inspection (HIT vs MISS), and Touch UI overlay toggle. Physical OS mouse pointer parked outside the Chrome window, completely clean frames with zero bottom hover pills or second cursors. Verified OK via `node video/scripts/verify-chapter.mjs 04-devtools-v2`. Original `04-devtools.mp4` preserved untouched.
  (7) **05-sync-v2.mp4** (`chapters/05-sync-v2.mjs`): 11 voice lines, 180.9s duration, 10856 frames (1920x1080 @ 60fps), audio/video in perfect sync. Fully demonstrates downstream safe directionality, pre-sync property diff with change badges, automatic target version creation, instant undo restoration, and the user-requested non-existing page pre-stage and post-stage sync workflow: navigates to Local showing 404 for `/content/wknd/us/en/expedition.html`, navigates to live production domain `https://www.wknd.com/expedition`, pushes downstream to Local creating page skeleton and content, and verifies post-stage result live on Local author in Touch UI editor. Verified OK via `node video/scripts/verify-chapter.mjs 05-sync-v2`. Original `05-sync.mp4` preserved untouched.
  (8) All 7 chapters verified OK via `verify-chapter.mjs` with 0 drift and 100% 1920x1080 frames. All temporary `capture.mp4` files deleted. `npm run check` clean (266/266 unit tests passing, 0 lint errors). Original videos in `video/out/` preserved untouched. Next chapter to record is Chapter 6 (SEO & a11y audit).
- **Ch5 session (Content sync):** wrote `video/env/ch5-content.py` and `video/chapters/05-sync.mjs` (11 steps, 181.1 s). Recorded in screen mode with real Chrome window; `verify-chapter.mjs 05-sync` OK (181.1 s video = 181.0 s audio, 10863 frames 1920x1080, 11 voice lines in voice A Christopher, no "step failed"). Large `capture.mp4` deleted. One 4x3 contact sheet viewed (`video/work/05-sheet.png`): clean frames, tab strip, real address bar, no blank frames. All 5 Ch5 items ticked in `video/FEATURES.md`.
  **Shown (log lines and video confirm):**
  (1) Cross-environment content sync (Push / Pull): Sync menu opened via `#asp-sync-btn` on Dev and Prod CDN; "Push to LOCAL" from Dev, "Push to LOCAL" from Prod CDN; page content copied between environments without leaving browser.
  (2) Safe directionality: on Dev, menu shows `← Pull from STAGE`, `← Pull from PROD`, and `→ Push to LOCAL` (only pull from higher, push to lower); upward push is blocked. Narration explains safety setting "Allow syncing to higher environments".
  (3) Pre-sync property diff: pre-sync confirmation dialog inspects target page and lists 5-6 exact property differences (`+` added badge, `−` removed notes, `~` changed title and teaser properties).
  (4) Automatic version backup: pre-sync dialog states "after saving the current one as a version"; AEM version created on target with label `before-sync-from-dev-<timestamp>` verified in version history.
  (5) Instant undo: success toast carries interactive "Undo" button; clicking Undo executes `UNDO_SYNC`, restoring Local from local snapshot immediately with toast `✓ LOCAL restored to how it was before the sync`; multi-tier fallback to AEM version backup explained.
  (6) Pre-stage on Local (non-existing page): navigating to `http://localhost:4502/content/wknd/us/en/expedition.html` displays a live 404 resource not found error, demonstrating that the page does not exist on Local.
  (7) Live Prod CDN & URL mapping: navigating to `https://www.wknd.com/expedition` on the live public production domain; Orbit toolbar expands, detects the Prod environment, and maps the clean public URL back to `/content/wknd/us/en/expedition`.
  (8) Push missing page from Prod CDN to Local: opening Sync menu on Prod CDN (`www.wknd.com`), selecting "→ Push to LOCAL". Orbit detects page does not exist on Local and offers confirmation dialog explaining it will create the page skeleton and copy content.
  (9) Confirmation & page creation: confirming the dialog copies content tree via Sling post servlet; toast confirms `✓ Page copied PROD → LOCAL (created)`.
  (10) Post-stage result on Local: navigating back to Local author editor (`/content/wknd/us/en/expedition.html?wcmmode=edit`), displaying the newly created Himalayan Expedition page fully rendered in Touch UI with Draft status, ready for development.
  Demo content helper: `ORBIT_ADMIN_PW=admin python3 video/env/ch5-content.py` creates/resets `sync-demo` on Dev/Local and `expedition` on Prod (published to Prod CDN) while ensuring `expedition` is cleaned from Local.
- **Three no-UI features wired up in `src/` (latest, user request; `src/` CHANGED):**
  (1) **Content Fragment inspector:** the asset card (`showAssetCard`, content script) now also calls `GET_CONTENT_FRAGMENT_INFO`; for a CF the title becomes "Content Fragment" and it adds Model, Variations and a Headless JSON row (`/api/assets/<path>.json`, Open/Copy). New More-menu entry "Asset / Content Fragment details" when the page path is under `/content/dam/` (the CF editor URL `/editor.html/content/dam/...` is such a page). `getContentFragmentInfo` was FIXED: on a real instance `jcr:content.json` only has a stub for `data`, so it now also reads `jcr:content/data.1.json` for `cq:model` and variation nodes (verified on Dev: riverside-camping-australia -> model `adventure`), accepts only `/content/dam/...` paths (no `..`), and returns `modelName`. (2) **Diagnostics:** Options, each env tab: "Run diagnostics" button next to Test Connection, result rows per tier (Author, CSRF token, Publish, Preview, Dispatcher / CDN) with HTTP status + ms. It uses the unsaved form values (`runDiagnostics(env, cfgOverride)`), asks host access inside the click, and `RUN_DIAGNOSTICS` is now restricted to extension pages like `TEST_CONNECTION` (it used to be callable from a content script and used saved credentials). Verified on Dev: Author 33 ms, CSRF token issued, Publish/Preview/Dispatcher 335 ms. (3) **EDS + Universal Editor:** `getUrlVariants` returns `universalEditorUrl` + `imsOrg`; tier menu has a "Universal Editor" entry (needs an https author); popup "Copy URLs" lists Universal Editor, and on an `.aem.page/.aem.live` tab also "EDS Preview" / "EDS Live"; tier menu on an EDS page offers the other EDS tier. New setting `imsOrg` (Options -> General -> "Universal Editor organisation", default `adobe`, validated `[\w.-]{1,64}`, also in `schema.json`). `getUniversalEditorUrl` now returns `https://experience.adobe.com/#/@org/aem/editor/canvas/<host><path>` (host and path, NOT the percent-encoded URL) and '' for non-https URLs. CAVEAT: the toolbar only mounts on CONFIGURED hosts, so an EDS page needs its `.aem.page/.aem.live` host entered as Publish/Preview/Dispatcher host of an env (the demo extension already grants `*.aem.page` / `*.aem.live`). Not verified in a browser: the EDS tier switch and the popup EDS rows (no EDS host configured in the demo env; Ch8 must seed one and mock the host). Tests: 266 pass (new: CF real-shape + path validation, UE variant + org fallback, diagnostics override, UE URL shape), lint 0 errors. README rows and EDS section rewritten. Demo extension rebuilt, Chrome relaunched (seed/login/tours done). FEATURES.md: CFM item note updated. Chapters that can now show them: Ch4 (CFM, needs a re-record or a short extra step), Ch8 (EDS/UE), Ch10 (diagnostics). No chapter was recorded this session.
- **Cleanup / review of all modified + untracked files (latest, user request):** reviewed every diff. FIXED: (1) `src/options/options.js` lockConfiguration looked up `#btnSave` (does not exist; the id is `#save`) and prepended its banner to `.container` (does not exist; `.page`), so the read-only lock never disabled Save and the banner never showed. (2) `resolveProfile` (`src/shared/url-utils.js`) fell back to the FIRST profile for any unmatched page, so every non-matching site silently got profile 1 content root/mappings; it now returns null (explicit `activeProfile` still wins) and `contentRoot` is matched on whole path segments (`/content/alpha` no longer matches `/content/alphabet`); one regression test added. (3) README: the profiles example used an array with wrong keys (real schema = object keyed by id, `label`, `matchDomains`), and claimed secrets are purged under `enforceSessionAuthOnly` (the code only ignores them); both corrected. (4) Removed the empty "Preview status pill" CSS comment left by the earlier pill removal. (5) `scripts/e2e-chrome-devtools.mjs`: removed a hardcoded path into another tool's folder. (6) `eslint.config.mjs`: browser globals for `docs/tutorial/*.js`. DELETED (untracked, backup at `/tmp/old-demo-pipeline-backup.tgz`): the old demo pipeline `scripts/{capture-real-action-frames,capture-tutorial-frames,generate-comprehensive-audio,generate-demo-video,generate-neural-audio,inspect-live-demo,inspect-video-frames,record-real-live-actions,serve-demo,test-screencast}`, root `demo_video.html`, `docs/DEMO_VIDEO_SCRIPT.md`, and the `demo:video` npm script; stopped the serve-demo process. `npm run check` is now clean: 0 lint errors (the 4 old ones were in the deleted scripts), 262 tests pass. The HANDOFF "do not reuse the user\'s scripts/capture-*" rule is obsolete (they are gone).
  **Removed:** `docs/demo.mp4` + `docs/demo-silent.mp4` (git rm), `dist/e2e` (an old live integration test of `aem-api.js` against a local author, git-ignored, unreferenced) and `dist/screenshots` (old store screenshots, unreferenced). The three no-UI features are now wired up, see the first note below.
- **Voice A adopted for new chapters (latest, user decision):** `lib/narrate.mjs` defaults changed to A (`en-US-ChristopherNeural`, +3 %). Chapters 00-04 stay as recorded with B; the final A-vs-B choice is deferred to after all chapters are recorded (see "VOICE DECISION"). The old `dist/aem-orbit-comprehensive-walkthrough.mp4` analysis: same engine (edge-tts), ONE ~20 s paragraph per scene (12 scenes), scene wavs played back to back with 0.4 s gaps, no EQ/compression, -17.7 LUFS, LRA 2.9.
- **dist cleanup:** deleted from `dist/` (git-ignored build output, 493 MB -> 4.4 MB): all old demo mp4/webm/m4v files and `raw-*.mp4`, `demo_video.html`, `demo-port.txt`, the five frame/inspection folders and `test_*.png`. Kept: `extension/`, `policy-test/`, `aem-orbit-1.0.0-beta.zip` (`e2e/` and `screenshots/` were deleted later).
- **Tutorial page (latest, user request):** the user decided NOT to trim; the final video is the full length. Built `docs/tutorial/` (`index.html`, `tutorial.css`, `tutorial.js`, `posters/<id>.jpg`, `README.md`): a static, dependency-free chapter player (playlist, per-chapter topics, speed, auto-play next, `#<id>` deep links, strict CSP). README.md got a "Video tutorial" section linking to `https://iam-udit.github.io/aem-orbit/tutorial/`. Videos are NOT in git: `tutorial.js` reads them from the GitHub release `tutorial-videos` (`.../releases/download/tutorial-videos/<id>.mp4`) and from `docs/tutorial/videos/` (git-ignored) on localhost/file. Tested locally (all 6 chapters load, Next/hash/layout OK, fixed an overlay bug). NOT DONE (needs the user): create the release `tutorial-videos` and upload the 6 mp4s from `video/out/` (no `gh` CLI here, MCP has no asset upload), and enable GitHub Pages (main, /docs). When a new chapter is recorded: add its poster + `CHAPTERS` entry in `tutorial.js` + README table row, and upload the mp4. `dist/demo_video.html` (older artefact, git-ignored) was left untouched.
- **Re-record of 00, 01, 01b, 02 in screen mode (latest):** all four re-recorded in the real Chrome window (no URL pill; real address bar), each `verify-chapter.mjs` OK, no "step failed". `showUrl` helper and its calls removed from `01-orb.mjs` and `02-toolbar.mjs` (narration unchanged). Ch2 prepared with `demo-content.py` + Deactivate of `toast-demo` (log: `View live -> https://dev-cloud-publish.com/orbit-demo/toast-demo`; I did not view the Undo frame). No images viewed this session, no `src/` change. Chapter popups: none of 00-02 use the popup. Deleted capture.mp4 files and the old page-only frame dirs (and `size-frames`, `smoke-frames`). Total output now 00-04 = about 1,350 s (22.5 min) before Ch5-11, which is above the 15-18 min target for the whole video: trimming will be needed at Ch12 assembly. Ch5 is the next new chapter.
- **Screen-mode-for-all + real popup session (latest, user request):** (1) Standing rule written above: every chapter is recorded in screen mode (real window, tab strip, address bar), `ORBIT_SCREEN=0` is legacy. (2) URL pill removed from `lib/overlay.mjs`. (3) `lib/popup.mjs` rewritten: real OS click on the pinned Orbit icon; popup is a real page target (365x567), CDP clicks/typing work inside it, `close()` restores the page. Verified by a probe and by the Ch3/Ch4 runs (log lines `popup open at screen 1415,106`, compare results read inside the popup). (4) Extension pinning codified in `scripts/launch-chrome.mjs` (edits Preferences before launch). (5) Re-recorded Ch3 (after `ch3-content.py`) and Ch4, both `verify-chapter.mjs` OK, no "step failed". Ch4 needed one fix: the popup is only ~567 px high, so the Stage "Show diff" button was below the fold; the step now `scrollIntoView`s it first. One 4x3 sheet viewed (`video/work/04-sheet.png`): real window with tab strip, address bar and toolbar icons, no URL pill, no blank frames; it did not include a popup frame, popup proof is the log. Deleted the capture.mp4 files of 03/04, the old `03-authoring-screen` outputs and probes. Not changed: `src/`. CAVEATS: popup opening depends on a real OS click, so the Mac must be untouched and Chrome in front; Ch4 CFM item still unshown (user decision pending: wire the CFM inspector up in `src/` or drop the item and the README line 84 claim). Chapters 00, 01, 01b, 02 are still page-only and must be re-recorded (see RE-RECORD LIST); Ch5 (content sync) is still the next NEW chapter and must use screen mode + `openPopup(rec)`.
- **Ch4 session (first render, page-only; since re-recorded):** wrote and recorded `chapters/04-devtools.mjs` (23 steps, 389 s, read-only: it changes no content, so no content reset is needed before a re-record). `verify-chapter.mjs 04-devtools` OK. One 4x3 sheet viewed (`video/work/04-sheet.png`): no blank or cropped frames, panels too small to read, so the checks were the run log plus pixel stats (the dashed Highlight outline colour #0f62fe is present at 118-126 s, absent elsewhere). No `src/` change.
  **Shown (log lines confirm):** JCR tree + `teaser_main` filter on Dev, then Stage (different image); popup Compare (Local differs, Dev this env, Stage/Prod differ) + Show diff Stage -> Dev (`fileReference` changed); component inspector on the title (resource type, path, template; Copy -> "Copied"; CRXDE -> `/crx/de/index.jsp#/content/wknd/us/en/magazine/jcr%3Acontent/root/container/title_main`); Highlight on/off; DAM inspector (alaskan-grizzly.jpg, published, 1280x853, 309 KB; Open -> assetdetails.html); Developer links: CRXDE Lite, CRX Package Manager, `.model.json`, `.infinity.json`, `debugClientLibs=true`, `debug=layout`, Clear debug params (back to the clean URL); Hard reload (page marker lost = reloaded, via the service worker); cache headers on `wwwdev.wknd.com/magazine` (HIT, age 17 s) then Bypass cache (`?nocache=...`) -> MISS; editor overlays hidden/shown ("Overlays hidden" / "Overlays shown").
  **CFM item (was NOT ticked here):** now has UI (see the first note); Ch4 does not show it. Re-record Ch4 with a CFM step, or show it in a later chapter, before ticking it.
  **Other caveats:** (1) the narration says Highlight "does not move the layout by a single pixel"; I did not measure layout shift. (2) The component card only shows a resource path in `?wcmmode=edit` (AEM omits it on `wcmmode=disabled`), so Ch4 uses `?wcmmode=edit` URLs; the title bar appears slightly different from earlier chapters because of that. (3) "Layout debug" is only enabled outside the editor on Author and "Bypass cache" only off Author, both visible in the menu as disabled entries on the other tier. (4) Show diff is Stage -> Dev. The Dev JCR tree for Prod was not shown.
  **Tooling change (not `src/`):** `video/env/proxy.mjs` now answers a `HEAD` request on CDN hosts from the cache (before, HEAD always missed, so the extension's cache-headers panel, which sends HEAD, never saw a HIT). Proxy restarted (`python3 video/scripts/detach.py /tmp/orbit-proxy.log node video/env/proxy.mjs`). GET behaviour is unchanged.
  **Gotcha found:** the first run died with "unsettled top-level await" because ~16 leftover tabs from my probes were open in the demo Chrome; after closing all but one tab it passed. Before a run, check `curl -s http://127.0.0.1:9333/json/list` has about one page tab. Probe scripts were deleted.
- **Screen-mode experiment (superseded by the standing rule: screen mode is now the standard):** user asked to record the full browser (real address bar) instead of the viewport + URL pill, "option B". Implemented as opt-in `ORBIT_SCREEN=1` (see "Screen mode" above) and rendered Ch3 with it: `video/out/03-authoring-screen.mp4`, `verify-chapter.mjs 03-authoring-screen` OK (335.8 s video / 335.8 s audio, 20150 frames, all 1920x1080, constant 60 fps, max pts gap 16.7 ms, 26 voice lines, no "step failed"). The page-only `03-authoring.mp4` is untouched. Checked visually with a 2x2 test sheet and a 2x2 Ch3 sheet (viewed 2 sheets, over the usual one-sheet budget, because this was a feasibility test): real tab strip + address bar + padlock + extension icon visible, new tabs appear in the strip, address bar text not highlighted, no URL pill, no menu bar/desktop bleed, flash trimmed. The Preview step now logs the success toast ("Published to Preview"), so the earlier Ch3 caveat (1) does not apply to this render. Open question for the user: adopt screen mode for all chapters (re-record 00..03) or keep page-only. Edits: `lib/recorder.mjs`, `lib/overlay.mjs` (url() no-op when `__orbitNoUrl`), `lib/chapter.mjs` (`ORBIT_OUT_SUFFIX`), `lib/cdp.mjs` (extension-id cache), `scripts/verify-chapter.mjs`. No `src/` change. Not yet re-checked: audio/picture sync late in the chapter (only the start was measured) - spot-check before adopting.
- **Ch3 session (latest):** wrote and recorded `chapters/03-authoring.mjs` (26 steps, 336 s). `verify-chapter.mjs 03-authoring` OK; one 4x3 contact sheet viewed (`video/work/03-sheet.png`): no blank/cropped frames, toast text too small to read there, so the checks were the run log plus repository state after the run (preview-demo = preview Activate only, publish-demo Deactivate, lock-demo unlocked, delete-target still exists / delete-free gone, Prod guard-demo + bulk p01-p03 Activate). All 9 Ch3 items ticked. No `src/` change.
  **New helpers:** OBSOLETE (old tab-based popup helper, replaced by the real-popup `openPopup(rec)`, see Tooling): `openPopup(rec, extId, pageUrl, {zoom})` opened `popup.html` as a tab and stubs `chrome.tabs.query({active:true})` to return `pageUrl` (so env + JCR path resolve exactly as in the real popup); it also centres/zooms the popup and keeps its toast popup-wide. Call `rec.back()` then `pop.close()` when done. `lib/toolbar.mjs`: `expand/openMenu/clickMenuItem`, toast waiters (`waitToolbarToast`, `waitPopupToast`), dialog helpers (`waitDialog/dialogConfirm/dialogCancel/dialogGone/dialogState`), `paste` (Input.insertText). Use these in Ch4+ instead of copying from 02.
  **Demo content:** `ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py` (idempotent, ~1-2 min) rebuilds `/content/wknd/us/en/orbit-demo/authoring/*` on Dev (publish/preview/preflight/lock/delete pages, `tree-demo` with `d` unpublished on purpose, `bulk/p01..p51`) and Prod (`guard-demo`, `bulk/p01..p03`). RUN IT BEFORE EVERY RE-RECORD of 03: the chapter publishes, locks and deletes pages. `preflight-demo` references the never-published asset `/content/dam/wknd-shared/en/magazine/alaska-adventure/bear-path.jpg` (do not publish that asset). Dev only needs `bear-path.jpg` to stay unpublished.
  **Behaviour notes (verified):** a bulk batch (50 paths) containing a nonexistent path fails as a whole with 403 (AEM answers "No rights to replicate some paths"); the popup reports `published 1 of 51` (only the 2nd batch went through) and keeps the 50 failed paths in the textarea, which is what the chapter shows. The bulk dry run lists 50 rows for 50 existing pages. The `Delete page…` entry is in the toolbar `More` menu (dev mode on); referenced page -> HTTP 412 -> "Delete blocked - the page is referenced by other content". Lock/unlock were done through the Cmd+K palette (no visible Lock button in the toolbar), which also previews Ch11's palette.
  **Caveats:** (1) the preview step's `waitToolbarToast` matched the in-progress toast ("Publishing to Preview..."), not the success toast; the repository state confirms the replication and the narration only claims the details panel shows the Preview tier row - I did not view that frame. (2) Narration says "up to two hundred paths"; the video pastes 50-51, it does not paste 200. (3) Tree publish/unpublish pop-up dry run is shown on Dev only; Prod Guard on tree publish and delete is only mentioned, not shown (the typed page name is shown for publish, the typed page count for bulk). (4) Throwaway probes `video/work/probe-ch3{a..e}.mjs` can be deleted.
- **Bookkeeping session:** the status table still showed Ch2 as NEXT although it was already recorded (v1 + v2) and ticked. I did NOT re-record. Ran `node video/scripts/verify-chapter.mjs 02-toolbar` -> OK (251.8 s video = 251.8 s audio, 7585 frames, all 1920x1080). Marked Ch2 DONE and Ch3 NEXT. No images viewed, no FEATURES.md change (all Ch2 items were already `[x]`), no `src/` change. Ch2 caveats from the notes below still apply (Shift-click verified by URL log only; tier-menu "Edit" shown, not clicked). Ch3 reminder: create a page referencing a deliberately unpublished asset for pre-flight, and `orbit-demo` children for tree publish / bulk / safe delete (Dev only so far).
- **Ch2 v2 (user follow-up):** (1) Publish/Preview hosts (`<env>-cloud-publish.com`, `<env>-cloud-preview.com`) returned 404 for mapped URLs such as `/magazine` because `video/env/proxy.mjs` only mapped on the CDN hosts. `toUpstreamPath` now also applies `url-mappings.txt` on publish/preview hosts (no filter, no cache; `/content/...`, `/libs`, files with extensions pass through unchanged). Proxy restarted; Dev/Stage/Prod publish + Dev preview return 200 for `/magazine`. Local publisher (`localhost:4503`) is untouched and keeps full paths.
  (2) Demo pages had an empty body (header + footer only). `video/env/demo-content.py` (`ORBIT_ADMIN_PW=admin python3 video/env/demo-content.py`) now fills `orbit-demo`, `status-demo` and `toast-demo` on Dev with title, text, teasers, separator (page height ~2745 px). The two DAM images it uses were published on Dev so pre-flight stays clean. `status-demo` onTime changed to 2026-01-05 because a future onTime made Author return 404 for the page with `wcmmode=disabled`; offTime stays 2027-06-30. 02 was re-recorded.
  Dev only: `orbit-demo/*` still do not exist on Stage/Prod, so `stage/prod-cloud-publish.com/orbit-demo/toast-demo` is 404 (expected). After a re-record `toast-demo` ends Published; unpublish it first (curl in the v1 note below) or Undo will not show.
  I did not re-view the new video frames (the one contact sheet was spent on v1); the checks were `verify-chapter.mjs`, the run log (`View live -> https://dev-cloud-publish.com/orbit-demo/toast-demo`) and HTTP 200 on preview/publish/CDN.
- **Ch2 session (v1):** wrote and recorded `chapters/02-toolbar.mjs` (21 steps). `verify-chapter.mjs 02-toolbar` OK; one 4x3 contact sheet viewed (`video/work/02-sheet.png`). All 9 Ch2 items ticked in FEATURES.md. No `src/` change.
  Shown: Orb click -> toolbar; tier menu (Preview/Published/Live open new tabs; log: `dev-cloud-preview.com/magazine`, `dev-cloud-publish.com/magazine`, `wwwdev.wknd.com/magazine`); env chip Stage then Local (same page, same view); Shift+click Prod
  (URL unchanged, actions retarget); Cmd+click Dev (new tab); Locales on Dev (language master + CA/EN live copy; CA keeps View, language master from the editor stays in `/editor.html`); status panel on magazine, on locked+scheduled `status-demo`
  (panel text probed: Locked by admin, Goes live, Goes offline) and on the live copy `/content/wknd/ca/en/magazine`; toast flow Publish -> Undo -> Publish again -> View live (opens `dev-cloud-publish.com/orbit-demo/toast-demo`).
  Caveats: the tier menu's "Edit" entry is shown but not clicked (Edit is covered in Ch1). Shift-click was verified by the URL log only (still on localhost:4502 after clicking Prod); I did not look at that frame. The sheet is too small to read the toast text.
  **Demo content created on Dev only** (via `/bin/wcmcommand`): `/content/wknd/us/en/orbit-demo` (parent), `.../orbit-demo/status-demo` (locked by admin, onTime 2027-03-01, offTime 2027-06-30), `.../orbit-demo/toast-demo`.
  I also activated 10 referenced items on Dev publish (page template, XF template, two `sling:configs`, two WKND logo SVGs, header/footer XFs) because the pre-flight "Unpublished references" dialog blocked Publish (first run failed on it).
  For Ch3's pre-flight demo, create a page that references a deliberately unpublished asset.
  **Re-running 02**: `toast-demo` is now Published on Dev, and the "Undo" button only appears when the page was a Draft before. Unpublish it first:
  `curl -u admin:$ORBIT_ADMIN_PW -X POST http://127.0.0.1:4512/bin/replicate.json -d cmd=Deactivate -d path=/content/wknd/us/en/orbit-demo/toast-demo`.
  Probe scripts `video/work/probe{2..5}.mjs` are throw-away.
- **Ch1b v2 (latest):** user-approved src change: removed the secondary `Preview: <status>` pill (`#asp-preview-pill`, `updatePreviewStatus`, `.asp-status-pill-sm` CSS) from the expanded toolbar; Preview status is still in the status-panel "Preview tier" row and the popup. `updateStatus(status, lastModified)` lost its 3rd arg. 262/262 tests pass, `npx eslint video src` clean. Demo extension rebuilt + full relaunch done (Chrome up on :9333, seeded, logged in).
  `01b` re-recorded with a new `dragAndFan()` helper: Orb dragged to TL, TR, BR, BL corners, L/R edges, top centre, back to bottom centre, hovering each so the fan direction shows; double-click step deleted. Contact sheet viewed once (`video/work/01b-sheet2.png`): fan visibly flips direction per position.
  FEATURES.md: "Persistent positioning" stays `[ ]` only because of the double-click reset; everything else in it is shown. Ch2 chapter should click the status pill to show the Preview tier row. Mention to the user: the src change above, and the Orb never needs a double-click in recordings.
- **User decision (newest):** do NOT double-click the Orb in any recording. Step 3 of `01b` is deleted; the existing `video/out/01b-orb-position.mp4` still contains it, so re-record before assembly. The double-click-reset FEATURES item stays unticked (do not claim it in the video).
  User also asked why a second "Preview: Published" pill shows in the expanded toolbar: it is `#asp-preview-pill` (`src/content/content-script.js:133`), shown whenever the page's `jcr:content` has `cq:lastReplicationAction_preview`. On the demo envs that property exists because the demo `preview` replication agent was used. Not changed in src/ - awaiting the user's call.

- **Ch1b session (latest):** ran `01b-orb-position` detached, no "step failed", `verify-chapter.mjs` OK. One contact sheet viewed (`video/work/01b-sheet.png`). Ticked in FEATURES.md: summon/Esc, style toggle.
  NOT ticked: "Persistent positioning ... double-click resets". Drag and persist-after-reload work; the reset step is broken:
  in orb mode click 1 of the double-click expands the orb into the toolbar, the logo moves away from under the cursor, click 2 (and the `dblclick`)
  land on a toolbar item (event log: `click:svg:1, click:SPAN:2, dblclick:SPAN:2`), so the handler at `src/content/content-script.js:1536` never runs.
  Side effects visible in the video: a stray tier menu opens in step 3, the toolbar stays expanded at the dragged spot, and later steps (summon, Esc) start from the expanded toolbar rather than the orb.
  This looks like a product issue (dbl-click-to-reset is not reachable on a collapsed orb) - TELL THE USER; do not silently change src/. Options: (a) user decides to fix the product
  (e.g. ignore the click when `event.detail > 1` / make dblclick work on the expanded logo), or (b) re-record step 3 as: expand, then double-click the logo in the expanded bar only if that works (check with a DOM probe first),
  or show the reset via Settings. Also add a `rec.click` check that the orb is collapsed before the summon step.
  I removed the `asp-ui:https://dev-cloud-author.com` storage key from the demo Chrome profile (position reset) while probing; no src/ or repo files besides `video/FEATURES.md`, `video/HANDOFF.md`, `video/work/01b-sheet.png` changed.
- Done this session: `00-intro` (new, 54.9 s) and `01-orb` v3 (166.2 s), both verified OK, no "step failed". Concat order for Ch 12: 00-intro, 01-orb, 01b, ...
- **Orb "re-opening" flicker - real cause + fix** (`src/content/toolbar.css`): the per-leaf stagger (`--i * 28ms`) is intentional and is KEPT. The flicker was big
  dark unclipped rectangles flashing over the arc after the last leaf: each leaf has `clip-path` AND `backdrop-filter: blur()`, and Chrome paints the blur layer as the whole
  box while the leaf scales/fades in. Removed `backdrop-filter` from the leaves only (fill is 82 % opaque). Measured: dark-pixel fraction around the arc was 0.08-0.14 for ~10 frames
  with blur, flat 0.01 without. Tests 262/262 pass. The extension change is real product code (src/), so mention it to the user.
- **URL pill** is now top-centre (`lib/overlay.mjs`, class `.url`); while the chapter title is up it sits at top:150px below it (`.low`), then slides to top:18px. Orange `tag` is back at bottom-left.
- **Chapter title** auto-hides after 6.5 s (`rec.title(html, sub, ms)`; `ms = 0` holds it, used by the intro, which calls `untitle()` on its last line).
- **JCR search** now in Ch1: types `lastReplicated` then `template` into `#asp-inspector-search` (filters live; second term leaves the single `cq:template` row).
- Demo content differs per env (`ORBIT_ADMIN_PW=admin python3 video/env/vary-content.py`): Dev grizzly "Alaskan Adventure", Stage "Fly Fishing the Amazon", Prod "Camp Under the Alaskan Sky", Local original.
- After any `src/` change: `node video/scripts/build-demo-extension.mjs`, then FULL relaunch (`pkill -f orbit-chrome-profile; launch-chrome; seed-settings; login-all; dismiss-tours`). `chrome.runtime.reload()` alone left the content script unmounted.
- Contact sheets/crops go under `video/work/` (reading /tmp is blocked). `01-orb` in the next task: NEXT is Ch1b.
- Earlier: cropped-bottom frames fixed in `recorder.mjs`. Extension named "AEM Orbit". Mention to the user: replication agents have `userId: admin`; local CA cert expires 22 Dec 2026;
  `npm run check` stops at 4 lint errors in the user's untracked `scripts/` files (`npm test` itself passes).

## TODO (user will do later): re-record Ch4 for the Content Fragment steps
`video/chapters/04-devtools.mjs` now has two extra steps, placed right after the DAM asset inspector and before "developer links". NOT recorded yet, and not syntax-run against the browser (only `node --check` and eslint pass).
- Step 1: opens a real Content Fragment in the editor (`/editor.html/content/dam/wknd-shared/en/adventures/riverside-camping-australia/riverside-camping-australia` on Dev), More menu -> "Asset / Content Fragment details" (matched by the text "Content Fragment details"), waits for the card to show "Headless JSON".
- Step 2: logs the card (`cf card -> ...`: expect title "Content Fragment", Model `adventure`, Variations `master`), clicks the Headless JSON "Open" button (log `headless json -> https://dev-cloud-author.com/api/assets/wknd-shared/en/adventures/riverside-camping-australia/riverside-camping-australia.json`), comes back, then `rec.goto(DEV)` so the developer-links steps start on the magazine page again.
- Before recording: `src/` is already built into the demo extension and Chrome was relaunched with it; if you rebuild or relaunch, follow the standing procedure (`build-demo-extension.mjs`, `pkill -f orbit-chrome-profile; launch-chrome; seed-settings; login-all; dismiss-tours`, `ORBIT_ADMIN_PW=admin`). Ch4 is read-only, no content reset needed. Check `curl -s http://127.0.0.1:9333/json/list` has about 1 page tab.
- Things to watch: (a) the headless JSON opens as a plain JSON page (it needs the login session cookie, which the demo Chrome has); (b) the fragment editor is a heavy page, `goto` waits 5.2 s, raise it if the toolbar is missing; (c) `rec.goto(DEV)` after `rec.back()` is there because the earlier steps leave the page on a wcmmode=edit page and the later steps expect that; (d) the chapter gets about 30 s longer.
- After the run: `node video/scripts/verify-chapter.mjs 04-devtools`, check the log has no "step failed", then tick the Ch4 CFM item in `video/FEATURES.md` (line 54), update the Ch4 row of the status table (new duration, frame count, voice lines = 25), and re-upload `04-devtools.mjs`'s mp4 to the `tutorial-videos` release. Also update `docs/tutorial/tutorial.js` topics for Ch4 if it lists the DAM inspector (add "Content Fragment inspector").

## Where things live and what to back up
`video/` stays at the repo root (decided with the user; it is source, so it must NOT move under `dist/`, which is git-ignored build output that gets cleaned).

| Folder | In git? | Size (approx.) | What it is | If lost |
|---|---|---|---|---|
| `video/chapters`, `lib`, `scripts`, `env`, `HANDOFF.md`, `FEATURES.md` | yes | small | the recording pipeline, the demo-content scripts and these notes | restore from git |
| `video/out/` | **no** (git-ignored) | ~216 MB | the final chapter mp4s (`<id>.mp4`) | only by re-recording; **back these up or upload them to the `tutorial-videos` release** |
| `video/work/` | no | ~91 MB | scratch: TTS cache (`tts/`), extension-id cache, voice samples, contact sheets | safe to delete, it regenerates (the TTS cache just re-synthesises the voice) |
| `video/build/` | no | ~379 MB | Chrome for Testing, the demo extension build (`build/extension`) | safe to delete, rebuild with `node video/scripts/build-demo-extension.mjs` and the launch script |
| `docs/tutorial/videos/` | no | symlinks | local preview of the tutorial page | recreate the symlinks (see `docs/tutorial/README.md`) |

- `git clean -fdx` (or a fresh clone) deletes everything that is git-ignored, including `video/out/`. Copy `video/out/*.mp4` somewhere safe first.
- The tutorial page reads the mp4s from the GitHub release `tutorial-videos`, not from git.
- `/tmp/old-demo-pipeline-backup.tgz` (the deleted old demo scripts) lives in `/tmp` and is lost on reboot; copy it elsewhere if wanted.
