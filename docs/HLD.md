# High-Level Design (HLD) — AEM Orbit

**Document Version:** 1.0.0-beta  
**Target Platforms:** Chromium (Chrome, Edge, Brave, Arc, Opera, Vivaldi), Firefox (`>=115` MV3), Safari Web Extensions (Manifest V3)  
**Target Systems:** Adobe Experience Manager (AEM as a Cloud Service & AEM 6.5)

---

## 1. Introduction & Objectives

### 1.1 Purpose
This High-Level Design (HLD) defines the software architecture, system boundaries, security model, and integration patterns for **AEM Orbit**, a Chrome extension designed to streamline authoring, developer operations, and content governance across AEM Cloud and AEM 6.5 environments.

### 1.2 Architectural Goals
- **Context Isolation & Security:** Adhere strictly to Manifest V3 security boundaries; isolate sensitive credentials from untrusted web page DOM contexts and verify `sender.id` on all runtime messaging.
- **Cross-Browser Compatibility:** Abstract browser runtime differences (`browser.*` Promises vs `chrome.*` callbacks, storage area availability, MV3 background worker/scripts patching) via `src/shared/browser-compat.js`.
- **Persona-Driven Workspace:** Tailor Settings, Toolbar, Radial Orb, Command Palette, and Popup controls cleanly across `author`, `qa`, `dev`, and `custom` personas (`src/shared/persona.js`).
- **Least-Privilege Host Access:** Avoid blanket `<all_urls>` host permissions; request and bind permissions dynamically only to user-configured domains.
- **Environment Agility:** Provide seamless, one-click tier navigation (Author ↔ Preview ↔ Publish ↔ Dispatcher/CDN) and multi-environment synchronization (Local ↔ Dev ↔ Stage ↔ Prod).
- **High Performance & Zero Runtime Bloat:** Utilize native ES modules, lightweight functional architecture, and modern build tooling (`esbuild`) with zero heavy runtime framework dependencies.

---

## 2. System Context & Architecture

```mermaid
flowchart TB
    subgraph Browser["Google Chrome Client (Manifest V3)"]
        subgraph WebPage["Web Page Context (Tab DOM)"]
            CS["Content Script: In-Page HUD\n(src/content/content-script.js)"]
            DOM["AEM Page / Editor DOM\n(/editor.html, /content/...)"]
            CS <--> |Inspect / Overlay / Highlight| DOM
        end

        subgraph ExtPages["Extension Privileged Context"]
            Popup["Popup Workspace\n(src/popup/popup.js)"]
            Options["Options Page\n(src/options/options.js)"]
        end

        subgraph Background["Background Service Worker Context"]
            SW["Background Service Worker\n(src/background/service-worker.js)"]
            DNR["Declarative Net Request (DNR)\nSession Rules"]
            StorageSync[("chrome.storage.sync\n(Settings & Envs)")]
            StorageLocal[("chrome.storage.local\n(Secrets, Recents, Logs)")]
            
            SW <--> StorageSync
            SW <--> StorageLocal
            SW --> DNR
        end

        CS -- "chrome.runtime.sendMessage()" --> SW
        Popup -- "chrome.runtime.sendMessage()" --> SW
        Options -- "chrome.runtime.sendMessage()" --> SW
    end

    subgraph AEMInfrastructure["AEM Infrastructure (User-Configured)"]
        Author["AEM Author Tier\n(REST API, WCMCommand, Replication)"]
        Preview["AEM Cloud Preview Tier\n(agentId=preview)"]
        Publish["AEM Publish Tier\n(/bin/replicate)"]
        Dispatcher["Dispatcher / CDN / Public Site"]
    end

    SW -- "fetch() [CSRF + Session/Basic/Bearer Auth]" --> Author
    SW -- "fetch() [Cache Header Audits]" --> Dispatcher
    Author -.-> |Replication| Preview
    Author -.-> |Replication| Publish
    Publish -.-> |Cache Invalidation| Dispatcher
```

---

## 3. Subsystem Breakdown

### 3.1 In-Page Content Script (HUD Toolbar)
- **Role:** Injected into authorized AEM author, preview, publish, and dispatcher web pages.
- **Responsibilities:**
  - Renders a floating, draggable bottom toolbar pill with site-specific position persistence.
  - Displays real-time replication status (`Published`, `Draft`, `Modified`) and preview tier pills.
  - Hosts the Component Inspector, JCR Tree visualizer, editable region highlighter, and Command Palette (`⌘+K`).
  - Offers one-click **Edit / View / Live / Props** on the minimised bar, and Tier, Publish and Locales menus on the expanded bar. Locale and live-copy rows open in the same tier and view mode as the current page.
  - Places the buttons on each bar from a saved layout or active persona (`author`, `qa`, `dev`, `custom`). Buttons removed from the expanded bar move into the More menu and stay in the Command Palette (`fitFloatingBox()` constrains long lists such as Locales, Env Picker, JCR trees, and audit panels to the viewport with internal scrollbars).
  - Supports Expand/Collapse All and click-to-copy paths in the JCR inspector, Copy/Export JSON in SEO Audits, `.model.json`/`.infinity.json` inspection on Component cards, and live `storage.onChanged` synchronization.
  - Dispatches user actions to the background service worker via asynchronous message passing.

### 3.2 Extension Workspace Popup
- **Role:** Standalone extension action UI accessible from the browser toolbar.
- **Responsibilities:**
  - Displays current page metadata, status details, header Persona pill (`Author` / `QA` / `Dev` / `Custom`), clickable Environment switcher, and quick bookmarking (`★`).
  - Offers the same **Edit / View / Live / Props** one-click actions as the toolbar, and profile-aware live search that can point the popup at another page (with a note and a back button).
  - **Persona & Policy gating:** `qa` reveals the dedicated *QA Verification* group (*SEO Audit*, *Cache Headers*, *QA Readiness* matrix across Local/Dev/Stage/Prod) while hiding replication/JCR write actions; `author` simplifies workspace tools to authoring/publishing; `dev` activates *Developer Tools* and *QA Verification*; `custom` preserves shipped defaults while honoring individual checkboxes.
  - **Environment Compare:** Computes and renders SHA-256 canonical content drift across all configured tiers, with *Back* and *Copy JSON* diff controls.
  - **Version History & Checkpoints:** Lists Oak version trees, restores versions (with protected confirmation), and triggers checkpoint creations.
  - **Bulk Replication & Recent/Favourite Management:** Validates and executes batch publication/unpublication for up to 200 paths, and allows individual removal or clearing of Recent & Favourite lists.
  - **Quick Links:** Deep-links to Sites, Assets, CRXDE Lite, OSGi Consoles, and Cloud Manager.
  - **Action Audit Log:** Displays and exports device-local CSV action logs with auto-refreshing Undo for synced pages.

### 3.3 Options & Configuration Engine
- **Role:** Privileged configuration panel for managing workspaces, brand profiles, environments, and feature toggles.
- **Responsibilities:**
  - Provides **4-Persona selection** (`Author`, `QA`, `Developer`, `Custom`), dynamically updating toggles, visibility, Dev/QA button presets, and toolbar previews (`customSnapshot` preserves manual selections when sampling presets; *Customize in Custom mode* clones a preset).
  - Supports default environments (`local`, `dev`, `stage`, `prod`), dynamic custom environments, and **Multi-Site Brand Profiles** CRUD (`contentRoot`, `appName`, `matchDomains`, per-profile `urlMappings`).
  - Configures authentication methods (`Browser Session`, `Basic`, `Bearer IMS`, `None`), normalized trailing slashes, and `lockConfiguration` / `enforceSessionAuthOnly` / `allowedPersonas` managed enterprise policies (`schema.json`).
  - Requests dynamic host permissions (`requestOriginsCompat`) via `permissions.contains` + `permissions.request` and runs Multi-Tier Health Diagnostics (Author `HEAD` → `GET` fallback on 405, CSRF, Publish, Preview, Dispatcher/CDN).
  - Manages Dispatcher-to-JCR prefix URL mappings.
  - Tracks unsaved changes (sticky header note and a `beforeunload` guard) and offers settings export / import as JSON. Export never contains credentials, and import only fills the form until the user saves.
  - Offers an opt-in **Allow syncing to higher environments** safety setting. By default, page sync only copies from a higher environment to a lower one (by the configured environment order). The service worker's API layer enforces this too, not only the menu.
  - Lets the user choose and order the buttons on the regular and expanded toolbar (**Toolbar** section, opt-in through a *Customise toolbar buttons* switch). The layout is validated by a shared pure module, capped per bar, and never allows Delete or Unpublish as one-click buttons.
  - Provides a **floating orb** style enabled by default for the regular bar (with a *Use classic horizontal bar when collapsed* setting to switch back). Hovering it fans out a half ring of pointed leaves, icon above label: a fixed set (Edit, View, Live, Environment in the middle, JCR or Copy path, Props, Sites), where the Environment leaf swaps the fan for the environments (or opens the dropdown above the orb for 1 or more than 6); the geometry is a shared pure module (`orb-layout.js`).
  - Sets `data-asp-theme` (`light` / `dark`) on `<html>` through `syncTheme()` (`shared/theme-dom.js`) from the Settings theme choice `optionsTheme` (`auto` follows the browser theme, and changes with it). The toolbar, orb, popup, Settings page and shared dialogs all key their light styles on it instead of `prefers-color-scheme`.

### 3.4 Background Service Worker (API Broker)
- **Role:** Privileged background broker executing all network calls and enforcing security policies.
- **Responsibilities:**
  - Routes messages and executes AEM REST API calls (15s timeout, CSRF token attachment, up to two retries with backoff for GETs on a network error or 502/503/504).
  - Dynamically registers content scripts on authorized origins using `chrome.scripting`.
  - Configures `chrome.declarativeNetRequest` session rules for Sling Referrer filter validation.
  - Validates typed confirmation tokens for protected environments before any replication (publish, unpublish, publish to preview), destructive action or sync undo, and refuses Sync unless Developer Mode and its Sync button are on.
  - Keeps the last 5 pre-sync copies of target pages in `chrome.storage.local` so a sync can be undone, and offers read-only previews (content diff between environments, tree-publish dry run).
  - Returns only a generic message to the UI when a handler throws (details stay in the service-worker console), and shows desktop notifications for completed actions unless turned off in Settings.

---

## 4. Security Architecture & Data Flow

```mermaid
flowchart LR
    subgraph Untrusted["Untrusted In-Page Context"]
        ContentScript["Content Script (HUD)\n- Strict CSP\n- No Access to Secrets\n- DOM Text Escaping"]
    end

    subgraph Boundary["Privileged Message Router"]
        Router["Service Worker Router\n- sender.id Verification\n- Protected Env Guard\n- Sanitized Configs"]
    end

    subgraph Secure["Protected Storage & APIs"]
        Secrets[("chrome.storage.local\n(Device-Only Secrets)")]
        AEM["AEM Author REST APIs\n- CSRF Protection\n- 15s AbortSignal\n- DNR Referer Spoofing"]
    end

    ContentScript -->|Structured Message| Router
    Router -->|Read Credentials| Secrets
    Router -->|Privileged fetch()| AEM
```

### 4.1 Credential & Secret Segregation
- **Browser Session Auth (Default):** Reuses the browser's existing AEM login cookie (`credentials: 'include'`). No credentials are saved.
- **Local Storage Isolation:** Basic auth passwords and Bearer tokens are stored exclusively in `chrome.storage.local` (device-only, never synchronized across Google accounts).
- **Public Config Redaction:** Content scripts and popups receive sanitized configs via `getPublicConfig()`, which strips all secrets and provides only a boolean `hasCredentials` indicator.

### 4.2 Cross-Origin & CSRF Protection
- **Declarative Net Request (DNR) Rules:** AEM's `SlingReferrerFilter` rejects cross-origin `POST`/`PUT`/`DELETE` calls without valid `Referer` headers. Dynamic DNR session rules rewrite `Referer` and `Origin` headers to match the target author host for extension-initiated calls.
- **CSRF Token Injection:** All state-changing requests automatically fetch and attach tokens from `/libs/granite/csrf/token.json`.

---

## 5. Technology Stack & Design Decisions

| Category | Technology Selection | Architectural Rationale |
|---|---|---|
| **Architecture Paradigm** | Modular Functional (ESM) | Stateless, optimal for MV3 service worker lifecycles, zero `this` binding issues. |
| **Bundling Toolchain** | `esbuild` (`chrome116` + Firefox MV3 `--firefox`) | Sub-10ms build times, IIFE bundles for content/popup/options, native ESM worker/scripts output across browsers (`src/shared/browser-compat.js`). |
| **Testing Framework** | Native Node.js (`node --test`) + CDP E2E (`scripts/e2e/`) | Zero-dependency unit tests (`npm test`, 287 tests) + extensible real-Chrome CDP regression suite (`npm run test:e2e`, 20 checks across WKND Local/Dev/Stage/Prod). |
| **Styling & UI** | Scoped CSS (`.asp-` namespace) | Prevents CSS leakage into host AEM author and client website layouts. |
| **Accessibility Standard** | WAI-ARIA Modal Dialog Pattern | Focus trapping, Escape key handlers, full keyboard navigation. |
