### segment.08.md — Implement TTL Rule Expiration in Background Script

Add logic to automatically expire domain rules that use a TTL (Temporarily Allow) mode.

1. In `background.js`:

    - Add a function to check for expired TTL entries:

        - Iterate over all domain rules stored in `chrome.storage.local`
        - If a rule has mode `"allow"` and an `expiresAt` timestamp
        - Compare to current time; if expired, delete the rule or switch it to `"blacklist"`

    - Run this TTL check:
        - On extension startup
        - When a tab is updated or removed
        - Optionally, on an interval (e.g. every 10 minutes) using `setInterval`

2. Update existing rule evaluation logic so it respects TTL:

    - If TTL has expired, act as if the domain is in blacklist mode

3. Optionally log expired domains to the console for debugging (not required in production)

Do not update the popup UI in this segment — it already stores TTL with expiration. This segment focuses solely on background expiration enforcement.
