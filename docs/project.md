# AutoClearExtension

## Purpose

AutoClearExtension is a privacy-focused browser extension designed to give users direct control over persistent storage mechanisms like `localStorage`, `sessionStorage`, and `IndexedDB`. The extension allows users to automatically clear stored data on a per-site basis, with configurable triggers such as tab close, time delay, or navigation.

## Goals

-   Protect user privacy by clearing web storage automatically
-   Avoid dependency on untrusted third-party extensions
-   Offer a clear, minimal interface with simple toggles
-   Support site-specific rules:
    -   Permanent blacklist (auto-clear always)
    -   Temporary allow list (auto-clear after a set TTL)
    -   Manual clear button
-   Provide feedback on what storage data exists for current site
-   Comply with Manifest V3 standards
-   Avoid any unnecessary permissions or telemetry

## Planned Features

-   Extension popup UI with current domain controls
-   Persistent settings for domain rules
-   Content script to inspect and clear storage
-   Background script to monitor tab lifecycle
-   Option to enable/disable globally
-   Option to clear on:
    -   Tab close
    -   Domain change
    -   Timer (e.g. after 30 seconds)
    -   Manual user action

## Development Plan

1. Create a basic MV3 manifest
2. Implement content script with storage inspection/clearing logic
3. Build background script for tab tracking and messaging
4. Design popup UI with toggle buttons and rule display
5. Connect popup to storage settings and messaging system
6. Test across Chromium-based browsers (Brave, Chrome, Edge)
7. Add future support for Firefox (if needed)

## License

To be determined. Likely a permissive license (MIT or BSD-style).
