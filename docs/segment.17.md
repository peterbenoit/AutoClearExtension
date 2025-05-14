### segment.17.md — Refactor background.js into Domain Logic Modules

Refactor `background.js` to keep the file maintainable and agent-friendly.

1. Split logic into named top-level functions grouped by concern:

    - `handleTabUpdate(tabId, changeInfo, tab)`
    - `handleTabRemoval(tabId, removeInfo)`
    - `checkAndExpireTTLRules()`
    - `clearAllStorageForDomain(domain, source)`
    - `clearCookiesForDomain(domain, source)`
    - `getDomainRules()`
    - `setDomainRule(domain, rule)`
    - `shouldClearForDomain(domain)`

2. Move all code out of inline callbacks (e.g. `chrome.tabs.onUpdated.addListener(...)`) into these named functions

3. The only top-level logic should be:

    - Event listener registrations
    - A one-line call to `checkAndExpireTTLRules()` if needed at startup

4. Each function should remain in `background.js` for now but scoped cleanly and kept under 80 lines if possible

Do not change any behavior — this is a refactor-only segment to make future edits and debugging easier.
