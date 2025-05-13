### segment.10.md — Add Global Toggle and Settings Reset

Add a global enable/disable switch and a reset option to allow the user to control extension behavior more broadly.

1. In `popup.html`:

    - Add a global toggle checkbox labeled "Enable AutoClearExtension"
    - Add a reset button labeled "Reset All Rules"
    - Place these elements clearly separated from the per-domain rule editor

2. In `popup.js`:

    - On load:

        - Read a global `enabled` flag from `chrome.storage.local`
        - Initialize the toggle checkbox accordingly

    - On toggle:

        - Save the `enabled` value to `chrome.storage.local`
        - Show a status confirmation (e.g., "Extension Enabled" or "Extension Disabled")

    - On reset:
        - Clear all domain rules from `chrome.storage.local` (except the `enabled` flag)
        - Update UI accordingly and show a status message

3. In `background.js`:
    - Before applying any clearing logic or rule enforcement, check if `enabled` is true
    - If false, skip all logic including TTL checks and badge updates

This allows the user to globally suspend the extension without uninstalling it and to purge all custom rules in a single action.
