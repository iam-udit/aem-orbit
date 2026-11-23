# Contributing to AEM Orbit

Thank you for your interest in contributing to **AEM Orbit**! This document provides guidelines and instructions for contributing to this project.

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Development Setup

### Prerequisites

- **Node.js**: `v22.13.0` or higher (see [`.nvmrc`](.nvmrc))
- **npm**: `v10.0.0` or higher
- **Google Chrome** or Chromium-based browser (Brave, Edge)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/iam-udit/aem-orbit.git
   cd aem-orbit
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```

### Loading in Chrome for Local Testing

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the [`dist/extension`](dist/extension) directory.
4. When making changes to source code, run `npm run watch` to automatically rebuild on file saves.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run build` | Bundles background, content scripts, popup, and options into `dist/extension/` |
| `npm run watch` | Watches for file changes and triggers incremental rebuilds |
| `npm test` | Runs all 79 unit and integration test suites using native `node:test` |
| `npm run lint` | Runs ESLint across all JavaScript/ESM files |
| `npm run check` | Executes linting followed by the complete test suite |
| `npm run zip` | Packages the production zip into `dist/` |
| `npm run release` | Runs `check`, `build`, and generates the versioned release zip |

---

## Coding Standards & Guidelines

1. **Pure Functional Modules**: Favor pure functions, immutable data structures, and composition over mutable classes.
2. **Native Web & WebExtension APIs**: Leverage standard `fetch()`, `chrome.storage`, `chrome.declarativeNetRequest`, and `node:test` without heavyweight external UI frameworks.
3. **Security First**:
   - Credentials (Basic Auth tokens) **must** reside in `chrome.storage.local` and never sync to cloud storage (`chrome.storage.sync`).
   - Never inject arbitrary unsanitized HTML into the DOM; always use `escHtml()` or safe DOM construction.
   - External network calls must be constrained to configured AEM host origins.
4. **JSDoc Documentation**: Provide clean JSDoc comments with `@param` and `@returns` for exported functions.
5. **Testing**: Any new functionality or bug fix must include corresponding tests under [`test/`](test/). All tests must pass with 100% success rate.

---

## Pull Request Process

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes and add tests where applicable.
3. Run quality gates:
   ```bash
   npm run check
   ```
4. Commit your changes with clear, descriptive commit messages adhering to [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add support for custom dispatcher cache-busting headers`
   - `fix: correct CRXDE path parsing for nested content fragments`
   - `docs: update deployment guidelines in README`
5. Push your branch to your fork and submit a Pull Request.

---

## Issue Reporting

- Use the GitHub Issue Tracker to report bugs or request features.
- Please use the provided [Issue Templates](.github/ISSUE_TEMPLATE/) to supply context, reproduction steps, and screenshots if applicable.
