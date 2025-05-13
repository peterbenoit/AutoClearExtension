### segment.07.md — Add Rule Editing to the Popup UI

Enhance the popup interface so users can view and modify per-domain rules for storage clearing.

1. In `popup.html`:

    - Add a toggle switch or dropdown to choose between:
        - Always Clear (blacklist)
        - Temporarily Allow (TTL in minutes)
        - Disable (do nothing)
    - Add an optional input for TTL if "Temporarily Allow" is selected
    - Display a read-only view of the current rule

2. In `popup.js`:

    - On popup load:

        - Get the current tab’s domain
        - Fetch the domain rule from `chrome.storage.local`
        - Populate the UI with the current rule values

    - When the user changes the rule:

        - Update the rule in `chrome.storage.local`
        - Show a visual confirmation (e.g. "Rule updated")

    - If TTL is selected, store the expiration as a timestamp

3. Do not implement TTL expiration logic yet — that will be handled in the background script later

Keep UI minimal but clear. Focus on rule viewing/editing only, not execution.
