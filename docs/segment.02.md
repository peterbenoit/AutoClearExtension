Implement a minimal content script that clears `localStorage`, `sessionStorage`, and deletes all `indexedDB` databases on page load.

1. In `content.js`:

    - Add logic to clear `localStorage` and `sessionStorage`
    - List all `indexedDB` databases using `indexedDB.databases()`, and delete them
    - Wrap everything in a `try/catch` to avoid breaking pages

2. Do not add any conditional logic or communication with other extension files yet

3. This script will run on all pages for now, as declared in `manifest.json`

Limit the scope to this single file: no edits to other files.
