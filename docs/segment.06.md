Update `content.js` to respond to messages from the background script.

1. Add a `chrome.runtime.onMessage` listener in `content.js`

2. If the message type is `clear-storage`, run the storage clearing logic again

3. Confirm successful receipt with a response callback if needed

No UI or background changes in this segment—only adjust the content script.
