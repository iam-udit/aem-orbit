# AEM Orbit — Cross-Browser Extension

A cross-browser WebExtension (Chrome, Edge, Brave, Arc, Opera, Vivaldi, Firefox MV3, and Safari) for AEM Cloud and AEM 6.5, inspired by Adobe's AEM Sidekick and tailored with **Workspace Personas (`Author`, `QA`, `Developer`, `Custom`)**. It adds a floating toolbar to AEM Author, Preview, Publish and Dispatcher pages, plus a popup "Workspace" for work that spans several pages.

> **Disclaimer & License:** AEM Orbit is an independent, open-source community project licensed under the [Apache License 2.0](LICENSE) (see [NOTICE](NOTICE) for attribution and trademark terms). It is not affiliated with, endorsed by, or sponsored by Adobe Inc. "Adobe", "Adobe Experience Manager", "AEM", and "AEM Sidekick" are trademarks of Adobe Inc., used here only to describe compatibility. Tutorial demonstrations feature Adobe's open-source [AEM Guides WKND](https://github.com/adobe/aem-guides-wknd) sample site (Apache 2.0).

---

## 🎬 Video tutorial

Watch AEM Orbit being used, chapter by chapter, recorded live in a real browser against real AEM author and publish instances:

**[Open the video tutorial](https://iam-udit.github.io/aem-orbit/tutorial/)** (all chapters in one responsive player, with a chapter list, speed control and auto-play of the next chapter)

| # | Chapter | What it covers |
|---|---|---|
| 0 | Introduction & Personas Architecture | Cross-browser WebExtension (Chromium, Firefox, Safari), Author/QA/Dev/Custom personas, zero-trust security |
| 1 | The Orb & Persona Fan | Animated Orb, radial fan adapting to QA/Dev/Author personas, env switch, Expand/Collapse JCR tree |
| 1b | Positioning the Orb | Drag to all edges, position persistence across reloads, long-press summon, Classic Mini-Bar |
| 2 | Toolbar & Personas | Live More-menu persona switching, Tier switcher, cross-env Shift/Cmd clicks, scrollable 20-locale MSM list, toasts |
| 3 | Authoring & Replication | Quick publish, pre-flight checks, preview tier, page lock via Cmd+K, tree and bulk publish, Prod Guard |
| 4 | Developer Tools & Inspectors | Expandable JCR tree & path copy, Stage vs Dev diff, component & DAM cards, CFM headless JSON, cache headers, hard reload |
| 5 | Content Synchronization | Downstream content sync (Push/Pull), pre-sync property diff, automatic version backup, instant rollback |
| 6 | SEO & Accessibility Audits | QA/Dev audit button, benchmark 92/100 vs 32/100, duplicate DOM IDs, image dimensions/404s, Copy & Export JSON |
| 7 | Popup Workspace & QA Readiness | Header Persona/Env switchers, QA Release Readiness checklist, SHA-256 Diff Back/Copy, History CSV, Find & Replace |
| 8 | Edge Delivery & Universal Editor | Deduplicated Copy URLs, bidirectional EDS (`.aem.page` / `.aem.live`) switching with query preservation, Universal Editor |
| 9 | Enterprise Governance & Policy | Multi-Brand Profiles CRUD, persona policies (`allowedPersonas`, `controlPolicy`), SAML session lock, read-only lockdown |
| 10 | Settings & Options Console | Dynamic Author/QA/Dev/Custom persona cards, Clone to Custom, 5-tier diagnostics ping, live style switch, Toolbar Editor |
| 11 | Keyboard Shortcuts & Palette | `Cmd+K` keyword-indexed Command Palette, `Option+Shift+K` toggle, arrow execution, A-Z jumps, `Esc` dismissal |

Also available as a single continuous 30-minute walkthrough (`v4`) with embedded chapter markers, a 3.2-minute executive highlights cut, and a 55-second overview teaser. Maintainers: see [`docs/tutorial/README.md`](docs/tutorial/README.md).

---

## 📚 Technical Documentation
- **High-Level Design (HLD):** [`docs/HLD.pdf`](docs/HLD.pdf) (PDF with Architecture Diagrams) \| [`docs/HLD.md`](docs/HLD.md) (Markdown) — System context, security boundaries, and storage model.
- **Low-Level Design (LLD):** [`docs/LLD.pdf`](docs/LLD.pdf) (PDF with Sequence Flows) \| [`docs/LLD.md`](docs/LLD.md) (Markdown) — Module specs, sync engine, SHA-256 fingerprinting, and action contracts.

---

## Features

### 🧭 Toolbar: navigation
| Feature | Description |
|---------|-------------|
| **Environment picker** | Switch between Local / Dev / Stage / Prod. You land on **the same page on the same tier** (author → author, publish → publish). **Shift-click** changes only which environment actions target. **Cmd/Ctrl-click** opens a new tab. |
| **Where it shows** | Only on pages: the page editor (including Cloud Service `/ui#/aem/editor.html/…`), a page opened directly on author, and publish / dispatcher / preview pages. It is hidden on `start.html`, the Sites and Assets consoles, page properties, CRXDE, Package Manager, the OSGi console, login and other system pages. On the Cloud Service shell it appears and disappears as you move between the editor and the consoles. The popup still works with the page selected in a console. |
| **Edit / View / Live / Props** | The minimised bar has four one-click buttons: **Edit** (editor), **View** (the page as visitors see it, Author with `?wcmmode=disabled`), **Live** (the CDN host when one is set, otherwise Publish) and **Props** (page properties). The **Tier** menu moves between Edit, View, Preview, Published and Live for the current page. URL mappings are applied to the Publish, Preview and Live URLs. |
| **Locales** | The **Locales** menu lists the language master and the live copies of the page that actually exist (Multi Site Manager), plus the page's hreflang locales. Every row opens in the **same tier and view you are in**: edit stays edit, view stays view, Publish stays Publish, on the host of the current environment (hreflang links on another host are re-pointed). The menu opens at once with a loading row while the live copies are looked up. |
| **Preview tier** | AEM Cloud preview host support: **Publish to Preview** and a preview status pill. |
| **Slim toolbar + More menu** | The minimised bar shows Edit, View, Live and Props. The expanded bar adds the **Tier**, **Publish** and **Locales** menus, Sites and the **More** menu. Everything else is in **More**, grouped as *This page* (properties, asset inspector, copy page URL) and *Developer* (JCR properties, overlays, highlight, component inspector, developer links, hard reload, delete, sync — shown only when Developer mode is on). Menu rows have icons and a one-line explanation, and typing a letter jumps to the next row that starts with it. |
| **Page details** | Click the status pill (Published / Draft / Modified) for who changed or published the page, when, lock, schedule and live-copy state. |
| **Undo and shortcuts in toasts** | After Publish the message offers *View live*. After Unpublish it offers *Publish again*. Publish also offers *Undo* when the page was a draft before. Buttons show a busy state while an action runs, so a double click can't send it twice. |
| **Move and remember** | Drag the logo button to move the toolbar. Double-click it to centre it again. The position is remembered per site; every page starts with the regular bar or the orb, collapsed. |
| **Orb at the pointer** | With the orb on, turn on **Open the orb at the pointer** in **Settings → Toolbar**. Press and hold the mouse on empty page space for about half a second and the orb opens right there. The spot isn't saved; the orb goes back after about 3 seconds with the pointer away from it, on **Esc**, or on a click elsewhere. |
| **Light and dark** | The toolbar, orb, dialogs, popup and options page share one theme, set with the theme button in Settings (it cycles **Auto → Light → Dark → Auto**; the default, Auto, follows the browser's light/dark theme (Chrome reports the system one unless you set its own) and changes with it). Narrow windows switch to icon-only buttons. Animations are off when the system asks for reduced motion. |
| **Keyboard and screen readers** | Every control has a visible focus ring and a label. Menus open with focus inside, move with the arrow keys and close with Esc. Status messages are announced. |
| **First-run setup** | With nothing configured, the popup explains the three steps and the options page opens with a **Quick setup** card: Author address, sign-in method, *Test connection*, *Save and finish*. |
| **Tools menu** | Edit / `wcmmode=disabled` / Sites console / CRXDE (`/apps/<appName>`), `.model.json`, `.infinity.json`, `debugClientLibs`, `?debug=layout`, nocache, clear query params. |

### ✍️ Toolbar: authoring
| Feature | Description |
|---------|-------------|
| **Rich status** | Published / Draft / Modified badge. The tooltip shows modified-by, published-by, lock owner, on/off time and live-copy source. |
| **Publish / Unpublish** | Replication runs a **reference check** first and warns about unpublished or outdated references. A failed check never blocks the publish. |
| **Lock / Unlock** | Page locking via wcmcommand. A lock icon shows when the page is locked. Also in the command palette, together with **Save a version of this page**. |
| **Tree publish** | Publishes a page and all its descendants (QueryBuilder plus batched replication). The confirmation first runs a **dry run** and shows how many pages will be published (and how many are skipped), with a sample. If a batch fails, the others still run and the result says which pages did not publish. |
| **Sync page** | A developer feature: it appears only when Developer Mode and its Sync toggle are on, and the service worker refuses it otherwise. **← Pull from X** copies the page you're viewing from environment X into this one; **→ Push to X** does the opposite. **By default content only flows from a higher environment to a lower one** (for example Prod → Stage, using the order from Settings), so the menu offers only those rows. Turn on **Allow syncing to higher environments** in Settings → Safety to also allow lower → higher; the service worker enforces the same rule, not just the menu. That setting is greyed out in Settings while Developer Mode or its Sync toggle is off (your choice is kept). Sync always asks for confirmation, on every environment, before copying anything. Works from any tier, including a 404 page on the target. If the page or its parents don't exist on the target, you're asked first and they are created (as proper `cq:Page`s, with title and template taken from the source) before the content is copied. Existing pages are overwritten after confirmation (the target ends up matching the source: components and properties that only exist on the target are removed), but first the current target page is saved as an AEM version labelled `before-sync-from-<env>-<timestamp>`. If that backup fails, nothing is changed. The confirmation also **lists what will change** (up to 6 differences, or says the page already matches). After a sync the toast has an **Undo** button that writes the previous content back (the last 5 syncs are kept on this device) and a matching **Undo** in Action History. If the stored copy is gone or was too large to keep, Undo restores the `before-sync-from-<env>` AEM version instead. You can also restore that version yourself in Versions / Timeline. Copies `jcr:content` only, never publishes, and refuses DAM assets and non-`/content` paths. Protected targets need the typed page name. |
| **Delete** | Safe delete via wcmcommand (`force=false`). Referenced pages are refused. |

### 🛠 Toolbar: developer tools
| Feature | Description |
|---------|-------------|
| **Component inspector** | Hover or click a component to see its resource type and resource path. Copy either one or open it in CRXDE. |
| **JCR tree** | Collapsible `jcr:content` tree with a filter. |
| **Overlays / Highlight** | Toggle editor overlays and outline `[data-cmp-is]` components without shifting the layout. |
| **SEO & a11y check** | Title and description length, canonical, robots `noindex`, hreflang, Open Graph, viewport, `lang`, H1 count and heading order, image alt text, unnamed links, buttons and form fields, and a check of up to 25 same-origin links. Gives a score and a list of checks. |
| **Cache headers** | Dispatcher / CDN cache headers with a one-line verdict. |
| **Command palette** | **Ctrl/⌘+K** (also a small ⌘K button on the toolbar, and in the More menu) searches every command with instant fuzzy search and keyboard navigation. |
| **Confirmation dialogs** | Delete, Publish, Unpublish, Publish to Preview, Publish page and all sub-pages, Sync, Publish many pages and similar actions ask in a centred dialog in the current theme (Esc or a click outside cancels). Menus and panels still open above the toolbar. |
| **Toggle toolbar** | **Alt/⌥+Shift+K** (ignored while typing in inputs or editable regions). |
| **Floating orb** | The collapsed toolbar appears as an animated floating orb by default (toggle via **Use classic horizontal bar when collapsed** in **Settings → Toolbar** to switch between the orb and the classic horizontal bar). Hover it (or focus it with the keyboard) and a half ring of pointed leaves, like sun rays, fans out above it. Each leaf has its icon on top and its label below: a fixed set of one-click actions: **Edit, View, Live, Environment, JCR, Props, Sites**. Environment sits in the middle: click it and the environments open as leaves on both sides of it (the current one is marked), click it again, or press Esc, to go back; while the environments are open, the middle leaf reads **Back** (grey, with an arrow) so it can't be mistaken for the current environment; with one or more than six environments the leaves close and the usual dropdown opens above the orb instead. Environment names are shown in Title Case (Local, Dev, Stage, Prod). JCR needs Developer Mode and opens the JCR panel (the leaves step aside for it); without Developer Mode, **Path** (copy the JCR path) takes its place. The set is fixed, so the regular bar's button choices in Settings don't apply while the orb is on (they are kept for when it is off). Hover is the same neutral lift on every leaf; the environment colour only marks identity (the icon, the orb's ring), with darker shades in the light theme. The environment in use is filled, bold and shows a ✓, so it doesn't rely on colour alone. The caption under the orb reads like `Local · Published`, and toasts appear centred on the orb, just beyond the outer edge of the leaves, so the open leaves never cover them. The orb is a disc in a deep shade of the environment colour (the same in every theme) with a white AEM-style spiral in place of the logo: a thin and a thick strand that stay still, with one glowing dot running round the thick strand (faster while an action is running). Its outer border and glow take the environment colour too, and turn dashed on a protected environment, whose leaf also shows a lock. Click the orb to open the full toolbar (⌥⇧K or a click on the logo brings it back to the orb). Drag it to move it, double-click to recentre it. Near the left or right edge the ring becomes a clean sideways half ring (`|→` or `←|`), at the top edge it points down, and in a corner it is a narrower arc; there the leaves show only their icon and the name appears beside the leaf you hover. On touch screens the first tap fans the leaves out and the next tap opens the toolbar. The animation speeds up while a publish is running and stops under reduced-motion settings. It is on by default, and changes apply the next time a page loads. |
| **Customisable buttons** | Turn on **Customise toolbar buttons** in **Settings → Toolbar** to choose which buttons sit on the regular bar and on the expanded bar, and in what order. It is off by default, and turning it off returns to the standard toolbar (your arrangement is kept). Buttons you take off the expanded bar move into the More menu and stay in the command palette. Delete and Unpublish can't be placed on the bar (they stay in menus, behind a confirmation). The logo, status, environment, Close, More and Settings buttons always stay. Developer buttons show only while Developer Mode allows them. Changes apply the next time a page loads. |

### 📋 Popup: Workspace
| Feature | Description |
|---------|-------------|
| **Page info** | JCR path, status, details line, preview pill, ★ favourite. |
| **Edit / View / Live / Props** | The same four one-click buttons as the minimised toolbar. |
| **Search** | Finds pages as you type. When you pick a result the popup shows a "viewing another page" note with a back button to the page in the tab. |
| **Lock** | Lock or unlock the current page. |
| **Compare with other environments** | Compares `jcr:content` across environments using a SHA-256 hash of canonical content. Volatile properties such as timestamps are ignored. **Show diff** lists the changed properties for any environment that differs. |
| **Recent & Favourites** | The 20 most recent and up to 50 favourite pages, stored on this device only. |
| **Quick Links** | Sites, Assets, CRXDE, packages and more. OSGi and system console links appear for non-cloud hosts only; cloud hosts get a Cloud Manager link. |
| **Publish / Unpublish / Preview / Tree Publish / Tree Unpub / Bulk Publish** | One block of six buttons under Edit / View / Live / Props (Preview shows only when the environment has a Preview tier; without it Publish and Unpublish share the first row). **Bulk Publish** is here, not in *Workspace*: paste up to 200 paths or URLs to publish or unpublish. Protected environments require typing the page count. If some pages fail, only those stay in the box so you can retry them. |
| **Action History** | The last 200 actions, stored locally. Copy as CSV or Clear. |
| **Versions / Save Version / Copy URLs** | Version list and Save Version. Copy any URL variant of the page. These sit in *Workspace*, and move into *Developer Tools* while that group is shown, so its heading stays visible without scrolling. |
| **Developer Tools** | JCR, CRXDE Lite, Overlays and Delete. The group is shown only when **Developer Mode** is on in Settings, and each button follows its own toggle there. |

### 🔒 Protected environments
Prod is protected by default (any environment can be marked protected). Protected environments show a lock on the environment chip (toolbar and popup header) and a thin solid red border on the toolbar (also when it is minimised), and a red ring and "Protected" tag on their dialogs. Publish, Unpublish, Publish to Preview, Delete, Publish page and all sub-pages, Publish many pages and Sync actions always need a typed confirmation (the Confirm button stays disabled until it matches), and the service worker checks that confirmation again.

### 🏢 Enterprise & Modern AEM
| Feature | Description |
|---------|-------------|
| **Multi-Site & Brand Profiles** | Supports multi-brand / multi-site enterprises. Profiles define site-specific `contentRoot`, `appName`, and `urlMappings`, matching automatically by domain or JCR path prefix. |
| **Enterprise Policy Lockdown** | Centrally deployable via Chrome Enterprise Managed Policy (`chrome.storage.managed` / `schema.json`). Supports `lockConfiguration` (read-only settings banner and disabled inputs), `enforceSessionAuthOnly` (forces corporate SSO and blocks local credential storage), and team control policies (`controlPolicy`). |
| **Multi-Tier Health Diagnostics** | Settings → an environment → **Run diagnostics**: checks Author, the CSRF token, Publish, Preview and Dispatcher / CDN in one go and shows each tier's HTTP status and latency in ms. It uses the values currently in the form, so you can try them before saving. |
| **Edge Delivery Services & Universal Editor** | On an EDS page (`.aem.page` / `.aem.live`) the tier menu gains a one-click switch to the other tier, and the popup's **Copy URLs** lists both EDS URLs. Universal Editor links (`https://experience.adobe.com/#/@org/aem/editor/canvas/...`) are in the tier menu and in **Copy URLs**. |
| **Content Fragment & Headless Inspection** | The asset card (More → *Asset / Content Fragment details*, or *Inspect an image or asset*) shows, for a Content Fragment, its model, its variations and a link to its headless JSON (`/api/assets/...json`). |

#### Multi-Site & Brand Profiles Configuration
Enterprises managing multiple brands or multi-tenant sites can define profiles in configuration or Chrome Managed Policy:
```json
{
  "profiles": {
    "brand-a": {
      "label": "Brand A Global",
      "matchDomains": ["branda.com", "stage.branda.com"],
      "contentRoot": "/content/brand-a",
      "appName": "brand-a-site",
      "urlMappings": "/=/content/brand-a/us/en\n/uk=/content/brand-a/uk/en"
    },
    "brand-b": {
      "label": "Brand B Portal",
      "matchDomains": ["brandb.io"],
      "contentRoot": "/content/brand-b",
      "appName": "brand-b-site"
    }
  }
}
```
Orbit resolves the profile from the current hostname (`matchDomains`) or from the JCR path (`contentRoot`), and uses that profile's content root and URL mappings. A page that matches no profile uses the global settings.

#### Enterprise Managed Policy Lockdown
To enforce central organizational compliance and prevent accidental credential leaks:
- **`lockConfiguration: true`**: Locks the Options page into a read-only administrative state with an enterprise notice banner, disabling local modification of environments, hosts, or toggles.
- **`enforceSessionAuthOnly: true`**: Disables Basic Auth and Bearer Token input fields, forcing developers and authors to authenticate exclusively via corporate SAML/SSO Browser Session cookies (`login-token`). Stored credentials are ignored while the policy is on.
- **`schema.json`**: Shipped inside the extension package for automatic validation by Google Admin Console and macOS/Windows Chrome Policy engines.

#### Edge Delivery Services & Universal Editor
- The toolbar appears only on hosts you have configured, so to use it on an EDS site enter the `.aem.page` or `.aem.live` host as the Publish, Preview or Dispatcher host of an environment.
- On such a page the **Switch Tier / View** menu offers the other EDS tier (`.aem.page` ⇄ `.aem.live`), keeping the path and query string.
- **Universal Editor** opens the page in `experience.adobe.com`. The Author host must be https. Set the organisation (the `@org` part) under Settings → General → *Universal Editor organisation*; it defaults to `adobe`.

---

## Installation

### 🎭 Workspace Personas (`Author`, `QA`, `Developer`, `Custom`)
Choose the active workspace persona in **Settings → Workspace Persona**, the **More** menu, the **Command Palette** (`⌘K` / `Ctrl+K`), or the **Popup Header**:

| Persona | Designed For | Behavior Across Settings, Toolbar, Orb & Popup |
|---|---|---|
| **Author** | Content Authors & Editors | Streamlined authoring, preview, locales, and safe publishing with Developer & QA clutter hidden. |
| **QA** | QA & Verification Engineers | Dedicated *QA Verification* panel (*SEO & Accessibility Audit*, *CDN Cache Headers*, *QA Readiness* matrix across envs), Component/DAM inspection, read-only JCR/view focus (hides publishing & JCR mutations). |
| **Developer** | AEM Developers & Architects | Unlocks JCR Inspector (Expand/Collapse All + copy path), CRXDE Lite, overlays, Sync Content, Dispatcher flush, and QA tools. |
| **Custom** | Power Users / Legacy Default | Preserves today's exact default toggles/popup/toolbar behavior and lets you customize every Developer/QA switch and toolbar button freely (or clone any preset via *Customize in Custom mode*). |

> Long menus and result panels (Locales & MSM live copies, Environment Picker, JCR Inspector, SEO Audit, Cache Headers, Component/DAM Cards, and Popup search/panels) automatically stay bounded inside the viewport height — centering when needed and providing clean internal scrollbars.

### From source (developer mode)

1. Clone or download this repo. Use Node 22 LTS (`nvm use` reads `.nvmrc`).
2. Install and build:
   ```bash
   npm install
   npm run build          # Chromium (Chrome, Edge, Brave, Arc) → dist/extension/
   npm run build:firefox  # Firefox MV3 (115+) → dist/firefox/
   npm run build:all      # Both targets
   ```
3. **Chromium**: Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked**, and select **`dist/extension/`**.
4. **Firefox**: Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and choose **`dist/firefox/manifest.json`**.
5. **Safari (macOS/iOS)**: Convert **`dist/extension/`** using `xcrun safari-web-extension-converter dist/extension`.
6. Click the extension icon, then **Open Options** to configure your environments (or run Multi-Site Brand Profile CRUD setup). Grant host access when prompted.

---

## Configuration (Options Page)

Each environment (Local / Dev / Stage / Prod) has these fields:

| Field | Description |
|-------|-------------|
| **Author Host** | e.g. `https://author-p12345-e67890.adobeaemcloud.com` |
| **Publish Host** | e.g. `https://publish-p12345-e67890.adobeaemcloud.com` |
| **Preview Host** | AEM Cloud preview tier, e.g. `https://preview-p12345-e67890.adobeaemcloud.com` |
| **Dispatcher / CDN Host** | Public URL, e.g. `https://www.yoursite.com` |
| **Auth type** | **Browser Session** (recommended, reuses your AEM login and stores nothing), **Basic** (username/password), **Bearer** (IMS token) or **None** |
| **Protected** | Requires typed confirmation for destructive or bulk actions |

Global settings:

| Field | Description |
|-------|-------------|
| **JCR Content Root** | e.g. `/content/mysite` |
| **App Name** | `/apps/` folder name. Used for CRXDE deep links. |
| **URL Mappings** | Dispatcher/CDN to JCR path mappings (e.g. `/` → `/content/mysite/en`), used to resolve public URLs |

**Test Connection** checks the Author host and credentials using `currentuser.json`.

The page header stays in view while you scroll. It shows an **Unsaved changes** note when the form differs from what is stored (Chrome also warns before you leave with unsaved changes), the **Save** button, a **⋯** menu with **Copy settings as JSON** and **Import settings…**, and the light / dark toggle. Exported settings never include credentials. Import only fills the form, and nothing is saved until you click Save. The **Safety** section holds *Confirm before Delete*, *Confirm before Publish / Unpublish* (also asks on non-protected environments) and *Allow syncing to higher environments*, and **Developer Mode** (with per-button toggles) controls the developer actions on the toolbar, in the More menu and in the popup.

The **Toolbar** section has a **Customise toolbar buttons** switch. When it is on, it lists each bar's buttons with move up, move down and remove controls, an **Add a button** menu, a preview of the bar and **Reset to default**. The regular bar holds up to 6 buttons and the expanded bar up to 14. The layout is included in the exported settings.

Non-secret settings are stored in `chrome.storage.sync`. Passwords and tokens are stored in `chrome.storage.local` (see Security Notes).

---

## Architecture

```
aem-orbit/
├── manifest.json                   # Manifest V3 (optional host permissions, CSP)
├── src/
│   ├── package.json                # {"type":"module"} for Node tests (not shipped)
│   ├── background/
│   │   └── service-worker.js       # Message router, env resolution, confirmations, content-script registration
│   ├── shared/
│   │   ├── browser-compat.js       # Cross-browser API abstraction (Chrome / Firefox MV3 / Safari)
│   │   ├── persona.js              # 4-persona model (author, qa, dev, custom) & policy resolution
│   │   ├── aem-api.js              # AEM REST helpers (timeouts, CSRF, login detection)
│   │   ├── url-utils.js            # Pure URL / path / mapping / MSM helpers
│   │   ├── page-audit.js           # SEO, heading, broken image/link & a11y scoring
│   │   ├── orb-layout.js           # Floating orb radial geometry & persona leaves
│   │   ├── sync-direction.js       # Which way content may be synced (higher → lower unless allowed)
│   │   └── toolbar-layout.js       # Toolbar button registry, default layout, layout validation
│   ├── ui/
│   │   ├── page-actions.js         # Shared toolbar/popup handlers: messaging, escaping, confirmations, publish/delete
│   │   ├── dialog.js               # Themed, centred confirm / prompt dialogs
│   │   └── dialog.css              # Dialog styles (dark by default, light via data-asp-theme)
│   ├── content/
│   │   ├── content-script.js       # Floating toolbar, viewport-bounded menus/panels (dynamically registered)
│   │   └── toolbar.css             # Namespaced (asp-) styles + thin scrollable containers
│   ├── popup/                      # Extension popup + Workspace (Persona switcher, QA Readiness, Env Compare)
│   └── options/                    # Configuration page (Persona cards, Brand Profiles CRUD, Diagnostics)
├── scripts/
│   ├── build.mjs                   # esbuild → dist/extension/ and --firefox → dist/firefox/
│   ├── e2e-chrome-devtools.mjs     # Extensible Chrome DevTools E2E test entrypoint
│   └── e2e/                        # Modular CDP harness & live WKND suites (suites/01..05)
├── test/                           # node:test suites (287 unit & integration checks)
├── icons/                          # Generated PNG icons (the spiral on a red / grey tile)
├── generate-icons.js               # Zero-dependency icon generator (npm run icons)
├── eslint.config.mjs               # ESLint flat config
├── .nvmrc                          # Node 22 LTS
├── package.json / package-lock.json
└── .gitignore
```

All sources are ES modules. esbuild bundles the toolbar, popup and options into classic IIFE scripts, because content scripts can't load modules. The service worker stays an ES module. The output in `dist/extension/` keeps the `src/` layout, so `manifest.json` paths don't change.

### Message passing flow

```
Content script / Popup / Options
       │  chrome.runtime.sendMessage({ action, payload })
       ▼
Background service worker  (checks sender.id, resolves env from the sender tab)
       │  fetch() → AEM REST APIs (15s timeout, CSRF token on POST)
       ▼
AEM Author
```

The background worker makes every `fetch()` call, so AEM CORS headers don't block anything and credentials never reach the page context.

---

## AEM APIs Used

| Purpose | Endpoint |
|---------|----------|
| Status | `GET {path}/jcr:content.json` |
| JCR inspector / compare | `GET {path}/jcr:content.infinity.json` |
| Publish, unpublish, tree, bulk | `POST /bin/replicate.json` (`cmd=Activate` / `Deactivate`) |
| Publish to Preview | `POST /bin/replicate.json` with `agentId=preview` |
| Tree publish, search | `GET /bin/querybuilder.json` |
| Delete | `POST /bin/wcmcommand` (`cmd=deletePage`, `force=false`) |
| Create version | `POST /bin/wcmcommand` (`cmd=createVersion`) |
| Lock / unlock | `POST /bin/wcmcommand` (`cmd=lockPage` / `unlockPage`) |
| Versions | `GET /jcr:system/jcr:versionStorage/<uuid[0..2]>/<uuid[2..4]>/<uuid[4..6]>/<uuid>.1.json` |
| Live copies / language master (Locales) | `GET <siteRoot>.2.json`, then `GET <path>/jcr:content.json` for each candidate (at most 40) |
| References | `GET /libs/wcm/core/content/reference.json?path=` |
| Test Connection | `GET /libs/granite/security/currentuser.json` |
| CSRF token | `GET /libs/granite/csrf/token.json` |

---

## Security Notes

- **Browser Session auth (recommended)** reuses your existing AEM login cookie, so no credentials are stored at all. When you are signed out of an environment that uses it, the error names the host and the toast has a **Log in to <env>** button that opens that environment's login page in a new tab (also on the Compare panel, as a **Log in** button next to a *signed out* tag). Sign in, then retry. The toolbar and popup also tell you once if the page status could not be loaded because you are signed out. The button only ever opens a host that is configured for Browser Session auth.
- Basic-auth passwords and bearer tokens are stored in `chrome.storage.local`: this device only, **not synced**, and not encrypted at rest. Settings without secrets live in `chrome.storage.sync`. Credentials from older versions are migrated automatically on update. Turn on **Keep passwords and tokens for this browser session only** (Settings → Safety) to hold them in memory instead (`chrome.storage.session`): nothing is written to disk and you enter them again after the browser restarts.
- All AEM API calls come from the **background service worker**. Content scripts and the popup get a config with no credentials in it.
- **Least-privilege host access:** there is no `<all_urls>`. Host access is requested only for the hosts you configure (on Save or Test Connection), and the toolbar is injected only on those hosts.
- POST requests carry the AEM CSRF token. Requests time out after 15s by default (**Settings → General → Request timeout**, 5 to 120 s). Read requests (GET) are retried up to twice, with a growing delay, after a network error or a 502/503/504; writes never are. Error messages are generic: details go to the service-worker console only.
- **Team provisioning:** administrators can pre-set hosts, content root, URL mappings, timeout and environment order through Chrome enterprise policy (`chrome.storage.managed`, schema in [`schema.json`](schema.json)). Policy values override a user's own settings. Credentials are not part of the schema and cannot be provisioned this way.
- **Team control policy:** the same policy can switch off controls for everyone on the team (see [Team control policy](#team-control-policy)). The service worker enforces it on every action, so hiding a button in the UI is not what protects it.
- Desktop notifications for completed actions can be turned off in **Settings → Safety**. The action log is written either way.
- Before a sync overwrites a page, the target's previous content is kept on this device (last 5 syncs, `chrome.storage.local`) so **Undo** works. It holds page content, not credentials.
- **Protected environments** (prod by default): destructive and bulk actions require typed confirmation, and the service worker checks it again.
- Delete goes through `/bin/wcmcommand` (`cmd=deletePage`, `force=false`). Live pages are unpublished first, and referenced pages are not deleted.
- Recent pages, favourites and the action log are stored **locally only** (`chrome.storage.local`). CSV export guards against spreadsheet formula injection.
- **Settings export** (Copy settings as JSON) never contains usernames, passwords or tokens, and import never sets them.
- The SEO link check and the cache-header check are same-origin only, with 15s timeouts.
- All page and AEM data is escaped or built with DOM APIs before rendering. The `OPEN_TAB` action allows only http(s) URLs.

---

## Team control policy

An administrator can decide which controls the members of a team may use, globally or per environment. It is delivered through Chrome enterprise policy (`chrome.storage.managed`), which users cannot edit, so it is the one place a limit can be trusted. Nothing is blocked unless it is listed.

```json
{
  "controlPolicy": {
    "disabledControls": ["delete", "sync", "developerMode"],
    "byEnvironment": {
      "prod": { "disabledControls": ["publish", "unpublish", "treePublish", "bulkPublish"] }
    }
  }
}
```

| Control id | What it switches off |
|------------|----------------------|
| `publish`, `unpublish`, `publishPreview` | Publish, Unpublish, Publish to Preview |
| `treePublish`, `bulkPublish` | Tree publish / unpublish, Bulk publish / unpublish |
| `delete` | Delete page |
| `sync` | Sync content between environments (and its Undo) |
| `saveVersion`, `restoreVersion` | Save version, Restore version |
| `lock` | Lock / unlock page |
| `findReplace` | Find & Replace |
| `flushDispatcher` | Dispatcher flush |
| `developerMode` | Developer Mode is forced off and its Settings toggle is locked. Global only, because Developer Mode is a single setting. |

How it behaves:

- **Enforced in the service worker.** A blocked action is refused before any request reaches AEM, whichever page or tab it came from. Read-only actions are never blocked.
- **Per environment.** A rule under `byEnvironment` applies to the environment the action targets. The toolbar re-checks it when the tab's target environment is switched.
- **The toolbar, popup and Settings mirror it.** Blocked buttons and menu rows are hidden, and Settings shows which controls the administrator turned off. The error text a refused action returns says `<Control> is turned off by your administrator`.
- **Users cannot override it.** Only the managed policy is read. A `controlPolicy` key in a user's own synced settings is ignored. Unknown control ids are dropped.
- **Deploying it.** Use your browser management tool (Google Admin console, or a policy file on Windows / macOS / Linux) to set the extension's managed storage to the JSON above. The accepted values are listed in [`schema.json`](schema.json).

### Trying it without installing an OS policy

On a machine whose Chrome policy is managed by someone else, or just to try a policy quickly, build a separate test copy with the policy baked in:

```bash
ORBIT_POLICY_TEST='{"disabledControls":["delete"],"byEnvironment":{"prod":{"disabledControls":["publish"]}}}' npm run build:policy-test
```

Load `dist/policy-test/` unpacked. It is named **AEM Orbit (policy test)**. To change the policy, rebuild and click **Reload** on the extension.

- The build fails if `ORBIT_POLICY_TEST` is missing, is not valid JSON, or blocks nothing (for example a mistyped control id), so a build can't pass by accident with no policy.
- It is a build-time constant: [`src/shared/policy-override.js`](src/shared/policy-override.js) is `null` in source. Nothing at runtime can set it, and the release build and `npm run zip` never include it. A test checks both.
- Never publish this build.

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| **⌘+K** / **Ctrl+K** | Any page with toolbar | Open Command Palette (fuzzy search all actions) |
| **⌥+Shift+K** / **Alt+Shift+K** | Any page with toolbar | Toggle toolbar visibility (show / hide) |
| **Esc** | Toolbar, Dialog, Panel | Close active menu, inspector, or modal dialog |
| **Arrow Up / Down** | Menus / Command Palette | Navigate through menu items |
| **A letter** | Menus | Jump to the next row whose title starts with that letter |
| **Enter** | Menus / Command Palette | Select / execute highlighted command |

---

## Development & Testing

Requires **Node.js 22 LTS** (`>=22.13.0`). Run `nvm use` to pick it up from `.nvmrc`.

```bash
npm install        # dev tooling (esbuild, ESLint)
npm run build      # bundle → dist/extension/ (Chromium MV3)
npm run build:firefox  # bundle → dist/firefox/ (Firefox MV3)
npm run build:all  # build Chromium + Firefox bundles
npm run watch      # rebuild JS on change, with source maps (rerun build for HTML/CSS/manifest)
npm run lint       # ESLint
npm test           # node:test suites (287 unit & integration tests)
npm run check      # lint + test
npm run test:e2e   # extensible Chrome DevTools E2E QA suite against live WKND AEM instances
npm run zip        # build → dist/aem-orbit-<version>.zip
npm run release    # check + zip (the Release workflow does this when you push a v<version> tag)
npm run icons      # regenerate icons
```

After a rebuild, click **Reload** on the extension in `chrome://extensions`.

---

## Chrome Web Store Deployment

To package and upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole):

1. Run the release command to perform full lint, automated testing, and ZIP generation:
   ```bash
   npm run release
   ```
2. The release artifact is generated at:
   ```
   dist/aem-orbit-<version>.zip
   ```
3. Upload the ZIP file directly in the Developer Console.
4. Fill in the store listing metadata, screenshots, and permission justifications as described in the documentation.
