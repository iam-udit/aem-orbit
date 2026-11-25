# Chrome Web Store Listing & Submission Guide

Use this guide when submitting **AEM Orbit** to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/).

---

## 1. Store Metadata

### Extension Name
```text
AEM Orbit
```
*(Complies with Google and Adobe trademark policies by placing the product name first).*

### Summary / Short Description (Max 132 characters)
```text
Developer & author toolkit for AEM Cloud & 6.5: environment switching, preview, publish, JCR tree, version diff, and page status.
```
*(Exactly 129 characters)*

### Category
```text
Developer Tools (or Productivity)
```

### Primary Language
```text
English
```

---

## 2. Detailed Description (Copy & Paste into Store Description)

```markdown
AEM Orbit is an open-source productivity toolkit for Adobe Experience Manager (AEM as a Cloud Service & AEM 6.5). Designed for developers, content authors, and QA engineers, it introduces an in-page floating HUD bar, an animated quick-access Orb, and a multi-environment workspace popup.

> Disclaimer: AEM Orbit is an independent, community-driven open-source project. It is not affiliated with, endorsed by, or sponsored by Adobe Inc. "Adobe", "Adobe Experience Manager", and "AEM" are trademarks of Adobe Inc.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎛️ WORKSPACE PERSONAS (AUTHOR, QA, DEVELOPER, CUSTOM)
• Author Persona: Clean authoring, preview, locales, and safe publishing without developer clutter.
• QA Persona: Built-in QA Readiness dashboard, SEO & Accessibility Audit (with duplicate ID & image dimension checks), CDN cache header inspector, component & DAM asset inspectors, and read-only view safety.
• Developer Persona: Full JCR repository tree (Expand/Collapse All & copy path), CRXDE Lite, overlays, content sync, and developer debug shortcuts.
• Custom Persona: Preserves classic shipped defaults with granular per-button and layout customization.

🧭 1-CLICK TIER & ENVIRONMENT SWITCHING
• Seamlessly jump between Author, Preview, Publish, and Dispatcher/CDN tiers.
• Switch across Local, Dev, Stage, and Production while preserving your exact page path.
• Shift-click to retarget actions without navigating; Cmd/Ctrl-click to open in a new tab.

✍️ AUTHOR & REPLICATION TOOLKIT
• Real-time status badges: Published, Modified, and Draft with detailed replication metadata.
• Tree Publish & Unpublish with dry-run previews that calculate exact page counts before executing.
• Bulk Replication: publish or unpublish lists of up to 200 pages with error isolation.
• Safe deletion via wcmcommand with reference checking.
• Multi-Site Manager (MSM): resolve language masters, regional live copies, and hreflang links.

🛠️ DEVELOPER TOOLS & REPOSITORY INSPECTOR
• Interactive JCR content tree visualizer with instant node search.
• Component Inspector: hover over components to inspect resource paths and resource types.
• Side-by-side environment content diffing with SHA-256 canonical fingerprints.
• Version Management: create Oak checkpoints, view history, diff revisions, and restore versions.
• Fastly / Dispatcher cache header inspector and replication queue monitoring.
• Command Palette (Cmd/Ctrl + K) with fuzzy search across all actions.

🔒 ENTERPRISE SECURITY & SAFETY
• Protected Environments: require typed confirmation tokens before running destructive or bulk operations on Production.
• Directional Content Sync: prevents accidental syncing from lower to higher environments by default.
• Zero Secret Leakage: HTTP credentials and tokens stay strictly in device-local storage (chrome.storage.local); browser session auth stores zero credentials.
• Enterprise Admin Control Policies: compatible with Chrome Managed Storage (schema.json) for corporate GPO / MDM policy enforcement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY & PERMISSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AEM Orbit respects enterprise data privacy:
• Zero tracking, zero analytics, and zero external telemetry.
• Network calls are strictly sent to your user-configured AEM host endpoints.
• Open-source codebase: https://github.com/iam-udit/aem-orbit
• Full Privacy Policy: https://github.com/iam-udit/aem-orbit/blob/main/docs/PRIVACY_POLICY.md
```

---

## 3. Permission Justifications (For Chrome Store Reviewers)

When submitting to the Chrome Developer Dashboard, Google reviewers will ask you to justify requested permissions. Use the exact responses below:

### `optional_host_permissions` (`http://*/*`, `https://*/*`)
> *"AEM Orbit is a developer utility designed for custom enterprise Adobe Experience Manager instances across diverse domains and intranet IPs. Rather than requesting blanket broad host permissions upfront, the extension requests host permissions on-demand (least privilege) only for the specific Author, Publish, and Dispatcher domains entered by the user in the Options page."*

### `tabs`
> *"The extension needs to observe tab URL changes across open browser tabs to detect whether the user is viewing an authorized AEM environment. This allows the extension to dynamically activate the toolbar icon, display active environment tags, and coordinate page navigation without injecting content scripts on unauthorized websites."*

### `activeTab`
> *"Used to inspect the current page DOM when the user invokes the popup workspace, toggle in-page editing overlays, and evaluate basic accessibility and SEO structure on the active document."*

### `scripting`
> *"Used to dynamically register and inject the HUD toolbar and styling strictly onto the specific AEM host domains authorized by the user, avoiding global script injection."*

### `declarativeNetRequestWithHostAccess`
> *"AEM instances enforce CSRF and Sling Referrer Filters (rejecting requests with foreign Origin or missing Referer headers). The extension uses dynamic declarativeNetRequest session rules to set appropriate same-origin Referer and Origin headers for user-initiated background API calls without exposing session cookies or credentials to the webpage DOM."*

### `storage`
> *"Used to save user preferences, environment URLs, and UI button layouts in chrome.storage.sync, and store device-local credentials and action undo histories securely in chrome.storage.local."*

### `notifications`
> *"Used to notify developers and authors when long-running asynchronous background operations (such as Tree Publish, Bulk Replication, or multi-page synchronization) have completed or encountered an error."*

---

## 4. Visual Store Assets Checklist

Upload the following assets in the **Store Listing** tab:

| Asset | Size | Format | Description |
|---|---|---|---|
| **Store Icon** | 128 × 128 px | PNG | High-res logo (already available at `icons/icon128.png`). |
| **Small Promo Tile** | 440 × 280 px | PNG / JPG | Shows the Orbit logo, slogan, and floating toolbar preview. |
| **Marquee Promo Tile** | 1400 × 560 px | PNG / JPG | Wide promotional graphic (optional, but helps get featured). |
| **Screenshot 1** | 1280 × 800 px | PNG | **The In-Page Toolbar & Orb**: Showcase the floating bar on an AEM page. |
| **Screenshot 2** | 1280 × 800 px | PNG | **The Workspace Popup**: Showcase page details, environment comparison, and quick links. |
| **Screenshot 3** | 1280 × 800 px | PNG | **JCR Tree & Component Inspector**: Showcase the developer inspection tools. |
| **Screenshot 4** | 1280 × 800 px | PNG | **Options & Environment Configuration**: Showcase the multi-tier setup and safety settings. |

---

## 5. Submission Step-by-Step

1. Build the production zip package:
   ```bash
   npm run release
   ```
   This generates `dist/aem-orbit-1.0.0-beta.zip` (clean bundle with maps and `.DS_Store` stripped).
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Click **Add new item** and upload `dist/aem-orbit-1.0.0-beta.zip`.
4. Fill in the **Store Listing** details using Sections 1 & 2 above.
5. In the **Privacy** tab:
   - Paste the URL to your hosted `PRIVACY_POLICY.md`.
   - In **Single Purpose**, enter: *"Provide a developer and authoring toolkit for Adobe Experience Manager environments."*
   - Paste the justifications from Section 3 for each permission.
6. Upload screenshots and promo tile from Section 4.
7. Click **Submit for Review**!
