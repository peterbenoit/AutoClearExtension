### segment.16.md — Refactor popup.js into Logical Init Functions

Refactor `popup.js` to improve clarity and modularity by separating concerns into logically grouped `init*()` or `bind*()` functions.

1. Split logic into the following named functions:

    - `initDebugLogPanel()`
    - `initGlobalSettingsControls()`
    - `initCurrentDomainEditor()`
    - `initStoredRulesSummary()`

2. Move all existing logic inside `DOMContentLoaded` into these named functions.

    - The `DOMContentLoaded` block should only call these four functions in order.
    - Do not nest any business logic inside the event listener directly.

3. Each function should be defined outside of `DOMContentLoaded`

    - Keep function scope tight, under 60 lines each if possible
    - Use helper functions when needed to break up complexity

4. Do not change any functionality — just relocate and clarify it

This sets up the file for possible future extraction into smaller files without overloading the AI agent or the runtime.
