### segment.11.md — Display Stored Rule Summary in Popup

Add a section to the popup UI to show a summary list of stored rules for reference and review.

1. In `popup.html`:

    - Add a section at the bottom labeled "Stored Rules"
    - Use a simple `<ul>` or `<table>` to display:
        - Domain name
        - Mode (blacklist, allow, off)
        - If mode is "allow" and has `expiresAt`, show remaining time (e.g., “5 min left”)

2. In `popup.js`:

    - On popup load:

        - Retrieve all domain rules from `chrome.storage.local`
        - Exclude the `enabled` flag
        - Populate the summary display with each domain and its rule details

    - Format TTLs relative to current time (e.g., “expired,” “3 min left”)

3. Make the section read-only — this is for display only, not editing
    - No delete or modify actions in this segment

Keep it compact and readable, ideally below the main controls.
