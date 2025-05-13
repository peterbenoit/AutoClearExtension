Update `background.js` to monitor tab activity and trigger storage clearing based on domain rules.

1. Listen to tab updates and tab removals using `chrome.tabs.onUpdated` and `chrome.tabs.onRemoved`

2. When a tab is closed or a domain change is detected:

    - Check if the domain is blacklisted
    - If so, send a message to the content script in that tab (if still active) to clear storage
    - Optionally, implement TTL expiration for temporary rules

3. Do not include cleanup for all tabs at once; only act per-tab
