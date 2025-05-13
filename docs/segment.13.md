### segment.13.md — Add Optional Logging Panel for Debugging

Add a developer-facing feature to optionally display storage clear events and rule evaluations within the popup for transparency and testing.

1. In `popup.html`:

    - Add a collapsible or toggleable section labeled "Debug Log"
    - Include a `<pre>` or `<div>` element with a fixed-height scrollable container
    - Add a checkbox or button to enable/disable live logging in this view

2. In `popup.js`:

    - Add logic to toggle the display of the debug log section
    - Listen for messages or populate the log from events such as:
        - Rule loaded or changed
        - Storage cleared event (received from background/content script via message)
    - Use `console.log()` and duplicate to the log panel if enabled

3. In `background.js` and `content.js`:

    - Where storage is cleared or rules are evaluated, send a message with a debug string:
        ```js
        chrome.runtime.sendMessage({
            type: 'debug-log',
            message: 'Cleared storage for domain xyz.com',
        });
        ```

4. Log viewer in the popup should:
    - Show the most recent messages first
    - Cap total number of entries (e.g. 50 max) to avoid memory issues

This feature should be optional, only active when the checkbox is enabled, and intended for development/testing use.
