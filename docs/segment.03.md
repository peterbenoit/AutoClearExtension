Update the background script to manage domain-specific rules.

1. In `background.js`, implement:

    - A persistent settings store using `chrome.storage.local`
    - An object to hold domain rules with the following structure:
      {
      "medium.com": { "mode": "blacklist" },
      "example.com": { "mode": "allow", "ttl": 60 }
      }

2. Implement logic to:

    - Initialize domain rules if none exist
    - Provide functions to get and update rules for a specific domain

3. Export these helper functions (attach them to `globalThis` or use `chrome.runtime.onMessage` if needed later)

Do not handle any tab or site activity yet. Limit the scope to domain rule storage and access.
