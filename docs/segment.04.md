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
