# Security Policy

## Supported Versions

We release patches and security fixes for the active version of **AEM Orbit**.

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| < 1.2   | :x:                |

---

## Reporting a Vulnerability

The security and privacy of our users are of paramount importance. If you discover a security vulnerability within this project, please follow these guidelines:

1. **Do not create a public issue** on GitHub for undisclosed security vulnerabilities.
2. Contact the maintainers privately via GitHub Security Advisories or email the maintainer at [contact via GitHub profile](https://github.com/iam-udit).
3. Include the following details in your report:
   - Detailed description of the vulnerability and potential impact.
   - Exact steps or script to reproduce the behavior.
   - Target environment and browser details.
4. Maintainers will acknowledge receipt within 48 hours and provide a timeline for triage and resolution.

---

## Security Architecture Highlights

- **Isolated Credentials**: All authentication secrets (passwords and API tokens) are strictly stored in `chrome.storage.local` on the user's local machine and never synchronized via `chrome.storage.sync`.
- **Declarative Net Request (DNR)**: Header modifications (e.g. `wcmmode=disabled` cookie management) leverage Chrome's declarative rules engine rather than intercepting raw network payloads in JavaScript.
- **Zero Remote Code**: The extension executes 100% self-contained code. No remote scripts (`eval()`, external CDNs) are loaded or executed, strictly complying with Manifest V3 and Chrome Web Store security guidelines.
- **CSRF Protection**: All mutating Sling/WCM endpoints automatically fetch and attach dynamic tokenized `CSRF-Token` headers.
