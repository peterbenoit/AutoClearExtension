### segment.09.md — Add Status Badge to Extension Icon

Display a status badge over the extension icon to indicate current rule state for the active tab’s domain.

1. In `background.js`:

    - Add a helper function `updateIconBadge(domain)`:

        - Retrieve the rule for the given domain
        - Set a badge using `chrome.action.setBadgeText()`:
            - `"CLR"` for blacklist (always clear)
            - `"TMP"` for temporarily allowed (TTL active)
            - `""` for disabled/no rule
        - Optionally, set badge color using `chrome.action.setBadgeBackgroundColor()`

    - Call this helper:
        - On `chrome.tabs.onUpdated` (when tab URL changes)
        - After TTL expiration is checked

2. In `popup.js` (optional enhancement):

    - Refresh badge when the rule is changed via popup

3. Badge should be minimal and not persistent — only update based on the active tab

Note: Badge display is not required for core function but improves visibility of rule state at a glance.
