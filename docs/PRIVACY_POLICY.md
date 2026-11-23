# Privacy Policy for AEM Orbit

**Last updated:** November 22, 2026

**AEM Orbit** ("the Extension", "we", "us", or "our") is an independent open-source browser extension developed for Adobe Experience Manager (AEM) authors, developers, and administrators. We are committed to protecting your privacy and ensuring complete transparency regarding how data is handled.

---

## 1. Zero Data Collection & Zero Tracking

- **No Personal Data Collected:** The Extension does not collect, track, log, or transmit any personally identifiable information (PII).
- **No Analytics / Telemetry:** We do not embed any analytics trackers (such as Google Analytics, Mixpanel, or Segment), telemetry beacons, or advertising SDKs.
- **No Third-Party Transmission:** The Extension never transmits your data, browsing history, or settings to external servers or third-party cloud services.

---

## 2. How Data & Credentials Are Stored

The Extension operates strictly on your local browser instance:

1. **Local Authentication Credentials (`chrome.storage.local`):**
   - Any sensitive authentication credentials you configure (such as HTTP Basic Auth passwords or Adobe IMS Bearer tokens) are stored exclusively in your browser's private `chrome.storage.local`.
   - These credentials **never synchronize across devices** and are never accessible to untrusted webpage scripts or external entities.
   - When using **Browser Session** authentication (the recommended default), no credentials are saved at all; the extension simply relies on your existing active session cookie.

2. **Non-Sensitive Configuration Settings (`chrome.storage.sync`):**
   - General application settings (such as configured AEM host URLs, content root paths, UI button arrangements, and light/dark theme preference) are saved using Chrome's built-in `chrome.storage.sync`.
   - If you are logged into Google Chrome with sync enabled, these non-sensitive settings synchronize across your own logged-in devices via Google's secure sync service.

3. **Local Action Audit History (`chrome.storage.local`):**
   - The Extension records a rolling log of recent user-initiated actions (e.g., publish, delete, content sync) locally on your device for user visibility and undo capabilities.
   - You can clear this history at any time from the Workspace popup or Options panel.

---

## 3. Network Communication

All network requests initiated by the Extension are:
- Strictly directed to the **AEM host endpoints that you explicitly configure** in the Extension Options.
- Executed in direct response to user-initiated actions (such as fetching page status, checking references, or publishing a page).
- Subject to Chrome's native security model, protected by strict Content Security Policies (CSP).

---

## 4. Chrome Permissions Explained

The Extension requests the minimum set of permissions necessary to function:
- **`storage`**: Used to save your environment URLs and local preferences.
- **`activeTab` / `tabs`**: Used to identify whether your currently active browser tab is an AEM page and display relevant environment information and toolbar controls.
- **`scripting`**: Used to inject the floating author HUD toolbar only onto the specific AEM domains you have configured and authorized.
- **`declarativeNetRequestWithHostAccess`**: Used to modify request headers (`Referer` and `Origin`) on API requests sent to your AEM Author instances to comply with AEM's `SlingReferrerFilter` without exposing credentials to untrusted webpage scripts.
- **`notifications`**: Used to display optional desktop notifications when asynchronous operations (such as Tree Publish or Bulk Replicate) complete.
- **Optional Host Permissions (`http://*/*`, `https://*/*`)**: The Extension requests host access **on-demand** only for the specific host domains you configure in Options. It does not monitor or access unrelated web browsing.

---

## 5. Third-Party Trademarks

"Adobe", "Adobe Experience Manager", and "AEM" are trademarks or registered trademarks of Adobe Inc. in the United States and/or other countries. **AEM Orbit** is an independent, open-source community tool and is not affiliated with, sponsored by, or endorsed by Adobe Inc.

---

## 6. Contact & Source Code

This Extension is open source. You can inspect the source code, report issues, or contribute at:
- **GitHub Repository:** [https://github.com/iam-udit/aem-orbit](https://github.com/iam-udit/aem-orbit)
