Create the initial file structure for a Manifest V3 Chrome extension called AutoClearExtension.

1. Add a basic `manifest.json` that includes:

    - `"manifest_version": 3`
    - `name`, `description`, and `version`
    - Permissions: `"storage"`, `"tabs"`, `"scripting"`, `"activeTab"`
    - Background script with `"service_worker"`
    - Action (for the popup UI, just placeholder for now)
    - Content script that runs on all pages and injects nothing for now

2. Create placeholder files:
    - `manifest.json`
    - `background.js`
    - `content.js`
    - `popup.html`
    - `popup.js`
    - `style.css`
    - `icons/` folder (empty for now)

Do not implement logic in any file yet. Only create the scaffolding and ensure all paths in `manifest.json` are correct.
