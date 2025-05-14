### segment.14.md — Clear Cookies for Blacklisted Domains

Extend the extension’s behavior to delete all cookies for domains marked as "blacklist".

1. In `background.js`:

    - When a domain’s effective rule is "blacklist", clear all cookies for that domain using `chrome.cookies.getAll()` and `chrome.cookies.remove()`
    - Only perform this action once per tab lifecycle or tab close to avoid unnecessary operations
    - Log a debug message like: `Cleared cookies for domain: medium.com`

    Example:

    ```js
    chrome.cookies.getAll({ domain }, (cookies) => {
        for (const cookie of cookies) {
            chrome.cookies.remove({
                url: (cookie.secure ? 'https://' : 'http://') + cookie.domain + cookie.path,
                name: cookie.name,
            });
        }
    });
    ```

2. In `manifest.json`:

    - Ensure the following permission is declared:
        ```json
        "permissions": ["cookies"]
        ```

3. Optional (but recommended):

    - In `popup.js`, add a manual "Clear Cookies Now" button for the current domain
    - Only enable this for blacklist-mode domains
    - Show a status message when cookies are cleared

4. Add corresponding debug-log entries for manual and automatic cookie clearing

This segment ensures that persistent cookies cannot track users on blacklisted domains.
