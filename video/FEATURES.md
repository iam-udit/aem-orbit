# Feature checklist - the video must show EVERY item below

Source: the user's approved feature list (verbatim). `[ ]` = not yet recorded, `[x]` = recorded AND verified in a rendered chapter.
`Ch N` = the chapter in `video/HANDOFF.md` that owns the item. The task that records a chapter ticks its items here at the end.
Final task (Ch 12) must find zero `[ ]` left, or tell the user which items are impossible and why.

## 1. In-Page Floating Orb & HUD (Ergonomics & Visuals)
- [x] Ch1  Animated dual-strand spiral Orb: floating HUD at the bottom of the page, AEM spiral with an orbiting pulse, live environment colour-coding, publication-state caption (e.g. Local · Published)
- [x] Ch1  Radial sunburst fan (7 action leaves): zero-click hover navigation expanding into a 7-leaf arc
- [x] Ch1  Leaf Edit: jumps into the AEM Author page editor (/editor.html/... or /ui#/aem/editor.html/...)
- [x] Ch1  Leaf View: loads the author page with editing chrome disabled (?wcmmode=disabled)
- [x] Ch1  Leaf Live: opens the public CDN / Dispatcher URL (or the Publish tier)
- [x] Ch1  Leaf Environment switcher: opens sub-leaves for Local, Dev, Stage, Prod
- [x] Ch1  Leaf JCR Inspector / Copy Path: launches the in-page JCR tree (or copies the path when Dev Mode is off)
- [x] Ch1  Leaf Page Properties: opens the native AEM Page Properties dialog
- [x] Ch1  Leaf Sites Console: jumps to the parent directory in AEM Sites (/sites.html/...)
- [x] Ch1b Summon at pointer (long-press): press and hold on empty page space ~0.5 s to summon the Orb at the cursor; auto-dismisses on Esc or clicking away
- [ ] Ch1b Persistent positioning and dragging: drag anywhere on the viewport; position saved per site; double-click resets to bottom-centre (drag to all 4 corners + 4 edges with the fan direction, and persist-after-reload, ARE shown in `01b`; the double-click RESET is deliberately NOT shown - user decision, the 2nd click opens a toolbar item)
- [x] Ch1b Style toggle: Radial Animated Orb vs Classic 4-button Mini Bar (Edit, View, Live, Props)

## 2. In-Page Horizontal Toolbar & Navigation
- [x] Ch2  Pill expansion: 1-click transition from the compact Orb into the full horizontal toolbar
- [x] Ch2  Tier switcher menu: move across Edit, View, Preview, Published and Live CDN tiers for the current page
- [x] Ch2  Cross-environment switching: jump between Local, Dev, Stage, Prod on the exact same page and tier
- [x] Ch2  Shift + Click: redirects background actions to target that environment without switching tabs
- [x] Ch2  Cmd/Ctrl + Click: opens the target environment in a new tab
- [x] Ch2  Multi Site Manager (MSM) and Locales menu: auto-discovers Language Masters, active Live Copies, hreflang alternate language links
- [x] Ch2  Locales preserve the active view mode (edit stays edit, view stays view) across all locales
- [x] Ch2  Live status badge and page details panel: click the Published / Draft / Modified pill to inspect author name, publisher, modification timestamp, lock owner, scheduling (onTime/offTime), Live Copy source
- [x] Ch2  Interactive toasts: context-aware feedback with quick-action links (View live, Publish again, Undo)

## 3. Authoring, Replication & Governance
- [x] Ch3  Quick Publish / Unpublish: one-click replication via /bin/replicate.json
- [x] Ch3  Pre-flight reference checking: scans for unpublished or outdated referenced assets/sub-pages before replication
- [x] Ch3  Publish to Preview tier: replicate only to the AEM Cloud Preview tier (agentId=preview)
- [x] Ch3  Page lock and unlock: toggle via wcmcommand with real-time lock indicators
- [x] Ch3  Tree Publish / Tree Unpublish: batch-replicate a page and all descendants via QueryBuilder
- [x] Ch3  Tree pre-flight dry run: total count, sample page paths, skipped pages before confirmation
- [x] Ch3  Bulk replication: paste up to 200 paths or URLs to publish/unpublish, with failure-retry isolation
- [x] Ch3  Safe delete: deletes pages via wcmcommand (force=false) with reference protection
- [x] Ch3  Protected environments (Prod Guard): typed confirmation (exact page count or page name) before destructive or bulk operations

## 4. Developer Tools & In-Page Inspectors
- [x] Ch4  Component inspector: hover/click a component to see sling:resourceType and resource path, 1-click clipboard copy, deep links to CRXDE Lite
- [x] Ch4  JCR tree inspector: in-page browser for jcr:content nodes, types, properties, live search filtering, environment comparison (search shown in Ch1; tree browse, filter on Dev vs Stage, and the popup compare + "Show diff" shown in Ch4)
- [x] Ch5  Cross-environment content sync (Push / Pull): "Pull from X" / "Push to X" copies page jcr:content between environments without leaving the browser
- [x] Ch5  Safe directionality: defaults to higher -> lower environments only (lower -> higher needs the safety override)
- [x] Ch5  Pre-sync property diff: up to 6 exact property changes before overwriting
- [x] Ch5  Automatic version backup: target page saved as before-sync-from-<env>-<timestamp> before writing
- [x] Ch5  Instant undo: multi-tier rollback via local snapshot or AEM version restore
- [x] Ch4  Toggle editor overlays: show/hide AEM Touch UI authoring frames and borders
- [x] Ch4  Component outlining / highlighting: outlines all [data-cmp-is] components without altering DOM layout
- [x] Ch4  Asset and DAM inspector: hover/click images for metadata (dimensions, format, path), deep link into the AEM DAM asset editor
- [x] Ch4  Content Fragment (CFM) and headless inspector: identifies Content Fragments (dam:AssetContent), variations, CFM models (cq:model), headless JSON endpoints (demonstrated in `04-devtools-v2.mp4`)
- [x] Ch4  Cache headers inspector: Dispatcher/CDN headers (Age, Cache-Control, Via, edge headers) with a one-line cache verdict
- [x] Ch4  Deep link: CRXDE Lite (/crx/de/index.jsp#/apps/...)
- [x] Ch4  Deep link: CRX Package Manager (/crx/packmgr/index.jsp)
- [x] Ch4  Deep link: Sling Model JSON (.model.json)
- [x] Ch4  Deep link: JCR Infinity JSON (.infinity.json)
- [x] Ch4  Debug client libraries (?debugClientLibs=true)
- [x] Ch4  Layout debugging (?debug=layout)
- [x] Ch4  Bypass cache reload (?nocache=...)
- [x] Ch4  Clear debug query parameters
- [x] Ch4  Hard reload: bypass browser cache fully via background service-worker tab reload

## 5. Automated SEO & Accessibility (a11y) Audit
- [x] Ch6  Automated page quality score (0-100)
- [x] Ch6  SEO checks: <title> length (30-60), meta description (70-160), absolute canonical URL, robots noindex detection, Open Graph tags (og:title, og:image, og:description), mobile viewport
- [x] Ch6  Accessibility checks: <html lang>, single <h1>, skipped heading levels (h2 -> h4), missing image alt, unnamed buttons/links, unlabelled form fields
- [x] Ch6  Link health: scans up to 25 same-origin links for broken (404/500) URLs

## 6. Extension Popup ("Workspace" Hub)
- [x] Ch7  Multi-page workspace: central dashboard for tasks spanning multiple pages
- [x] Ch7  Live page search: fuzzy search by title or JCR path, with a "viewing another page" notice and a return button
- [x] Ch7  Cross-environment compare and SHA-256 fingerprinting: compares jcr:content across all environments using canonical SHA-256 hashing (volatile timestamps excluded) with visual property diff
- [x] Ch7  Recent and starred favourites: last 20 visited pages, up to 50 starred
- [x] Ch7  Version timeline and checkpoints: version history, create labelled checkpoints, diff versions, restore a previous version
- [x] Ch7  URL variants hub: 1-click copy or open for Author, View, Live, Publish, CRXDE, Properties, Model JSON, Infinity JSON, Universal Editor URLs
- [x] Ch7  Quick links launchpad: Sites, Assets, CRXDE, Packages, OSGi Felix Console, Adobe Cloud Manager
- [x] Ch7  Audit action history log: last 200 operations, CSV export (spreadsheet-injection guarded), log clearing
- [x] Ch7  Find and replace across pages: search and batch-replace content / property values across site trees
- [x] Ch7  Dispatcher flush: invalidate the Dispatcher cache for the active page path

## 7. Modern AEM & Edge Delivery Services (EDS)
- [x] Ch8  EDS host detection: recognises .aem.page (preview) and .aem.live (production)
- [x] Ch8  EDS variant computation: 1-click switching between EDS preview and live tiers with parameter retention
- [x] Ch8  Adobe Universal Editor integration: deep links into the Experience Cloud Universal Editor canvas (https://experience.adobe.com/#/@org/aem/editor/canvas/...)

## 8. Enterprise Governance, Security & Managed Policies
- [x] Ch9  Multi-site and brand profiles: site-specific contentRoot, appName, urlMappings resolved by domain or JCR prefix
- [x] Ch9  Managed policy lockConfiguration: Options page becomes read-only with a policy notice
- [x] Ch9  Managed policy enforceSessionAuthOnly: forces SAML/SSO session cookies (login-token), disallows and purges local basic/bearer credentials
- [x] Ch9  Managed policy controlPolicy: centrally disable capabilities (delete, sync, publish, developerMode) globally or per environment
- [x] Ch9  Privacy and security architecture: zero telemetry/analytics/external calls; service-worker isolation (credentials never in page DOM); optional session-only credential storage (chrome.storage.session); granular host permissions (only configured hosts)

## 9. Settings (Options Page) - complete configuration matrix
- [x] Ch10 Header and quick setup: unsaved-changes indicator, light/dark/auto theme switcher, settings JSON export/import, shareable setup URL, 3-step first-run setup card
- [x] Ch10 Per-environment setup (Local / Dev / Stage / Prod / Custom): author host, publish host, preview host, dispatcher/CDN host
- [x] Ch10 Authentication: browser session (SSO), basic auth, bearer token, none
- [x] Ch10 Test connection and 1-click latency diagnostics (CSRF token verification + ms ping)
- [x] Ch10 Protected environment toggle, apply URL mappings toggle, append .html toggle
- [x] Ch10 Multi-site brand profiles: profile ID, name, domains, content root, app name, URL mappings
- [x] Ch10 General configuration: JCR content root, app name, request timeout (5-120 s), dispatcher URL mappings (multi-line prefix and exact redirect rules), environment precedence order
- [x] Ch10 Safety options: confirm before delete, confirm before publish/unpublish, allow syncing to higher environments, desktop notifications, session-only credential storage
- [x] Ch10 Toolbar visibility: author pages, publish pages, dispatcher/CDN domains, keyboard shortcut (Alt+Shift+K), last-modified timestamp display
- [x] Ch10 Collapsed toolbar style: classic horizontal mini-bar vs animated floating orb, summon orb on long-press
- [x] Ch10 Toolbar button layout editor: drag, reorder, add, remove buttons on Mini Bar (up to 6) and Expanded Bar (up to 14), auto-overflow to the More menu
- [x] Ch10 Developer mode controls: master toggle + toggles for JCR inspector, overlays, component highlighting, component inspector, developer links, hard reload, delete page, content sync
- [x] Ch10 Data management: reset to defaults, clear all data

## 10. Keyboard Shortcuts
- [x] Ch11 Cmd+K / Ctrl+K: open the command palette (fuzzy search across all actions)
- [x] Ch11 Alt+Shift+K (Option+Shift+K): toggle toolbar visibility
- [x] Ch11 Esc: close the active menu, inspector or modal dialog
- [x] Ch11 Arrow Up/Down + Enter: navigate and select within menus and the command palette
- [x] Ch11 A-Z letter jump: pressing a letter key in a menu jumps to the matching action
