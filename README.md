# AutoClearExtension

**AutoClearExtension** is a privacy-focused Chrome extension that gives users fine-grained control over storage and cookies on a per-domain basis. Built with minimal dependencies and no external libraries, it is designed to be lightweight, transparent, and easy to maintain.

---

## Features

-   Clear `localStorage`, `sessionStorage`, and `indexedDB` for blacklisted domains
-   Automatically clear cookies on command or via tab lifecycle
-   TTL-based "temporarily allow" rules with expiration
-   Per-site rule editor accessible from the extension popup
-   Global enable/disable toggle and rule reset button
-   Manual cookie clear button for active tab
-   Debug log panel with optional persistent logging
-   Visual indicator badge based on rule state

---

## Usage

1. Click the extension icon to open the popup.
2. Use the mode dropdown to configure behavior for the current domain:
    - **Off** – Do nothing
    - **Blacklist** – Always clear storage and cookies
    - **Temporarily Allow** – Allow for a set number of minutes (TTL)
3. Enable the debug log to monitor actions.
4. Use the "Reset All Rules" button to clear stored settings.
5. Use the "Clear Cookies Now" button to manually delete cookies for the current domain (if blacklisted).

---

## Permissions

The extension requires:

-   `cookies` – to read and delete cookies
-   `storage` – to persist rules and debug logs
-   `tabs`, `activeTab`, `scripting` – for rule evaluation and lifecycle management
-   `host_permissions: ["<all_urls>"]` – to apply rules across any site

No analytics, no remote tracking, no external API usage.

---

## Development

-   No build step required
-   Plain HTML, CSS, and JavaScript (Manifest V3)
-   No frameworks or external dependencies
-   Segmented AI-guided development stored in `/docs/`
