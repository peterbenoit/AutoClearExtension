---

### segment.04.md — Connect Popup UI to Domain Rule Management

Implement a simple popup UI that displays the current domain and allows toggling its storage-clearing status.

1. In `popup.html`:
   - Add basic layout with a domain display, a toggle button, and status text
   - Include references to `popup.js` and `style.css`

2. In `popup.js`:
   - On load, get the active tab's URL
   - Extract the domain
   - Query `chrome.storage.local` for its current rule
   - Display the rule status
   - Allow user to toggle between "blacklist", "allow (temporary)", and "off"
   - Save the rule back to storage

3. Keep the logic simple and self-contained for now; styling can be minimal.

---

### segment.05.md — Background Script: Respond to Tab Events

Update `background.js` to monitor tab activity and trigger storage clearing based on domain rules.

1. Listen to tab updates and tab removals using `chrome.tabs.onUpdated` and `chrome.tabs.onRemoved`

2. When a tab is closed or a domain change is detected:

    - Check if the domain is blacklisted
    - If so, send a message to the content script in that tab (if still active) to clear storage
    - Optionally, implement TTL expiration for temporary rules

3. Do not include cleanup for all tabs at once; only act per-tab

---

### segment.06.md — Handle Messages and Execute Clearing Commands

Update `content.js` to respond to messages from the background script.

1. Add a `chrome.runtime.onMessage` listener in `content.js`

2. If the message type is `clear-storage`, run the storage clearing logic again

3. Confirm successful receipt with a response callback if needed

No UI or background changes in this segment—only adjust the content script.
