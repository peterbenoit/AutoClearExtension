### segment.15.md — Persistent Debug Log and Viewer

Upgrade the debug log system to persist messages across popup openings using `chrome.storage.local`.

1. In `background.js`:

    - Create a helper function `logDebugMessage(message, source)`:
        - Prepend a timestamp
        - Add message to a stored log array in `chrome.storage.local`
        - Cap log size to the most recent 50 entries
        - Optionally call `chrome.runtime.sendMessage()` if popup is open

2. Replace all direct `debug-log` message calls with `logDebugMessage(...)`

3. In `popup.js`:

    - On load (if debug log is enabled):
        - Read the log array from `chrome.storage.local`
        - Render entries in the debug log container (most recent first)
    - Add a "Clear Log" button to reset the log in storage
    - Optionally add a toggle to show timestamps if space allows

4. In `popup.html`:
    - Replace the current debug `<pre>` with a scrollable list element (`<ul>` or `<div>`)
    - Add "Clear Log" and optional "Toggle Timestamps" buttons

Ensure the logging system does not interfere with extension performance or normal operations. Avoid growing the log indefinitely.
