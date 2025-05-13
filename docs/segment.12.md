### segment.12.md — Improve Popup UI Layout and Clarity

Refactor the popup layout to make it more readable, intuitive, and visually distinct.

1. In `popup.html`:

    - Remove the ambiguous "Toggle Status" button entirely
    - Group UI into clear sections using `<fieldset>` and `<legend>` or visual headings:
        - Global Settings
        - Rule for Current Domain
        - Stored Rules Summary
    - Add vertical spacing and section separators (`<hr>`) between major groups
    - Add IDs or classes to section containers for styling

2. In `style.css`:

    - Apply minimal spacing improvements:
        - Add vertical margin or padding to section groups
        - Distinguish section headers (`font-weight: bold`, spacing)
        - Optional: add a subtle border or background color to group containers

3. In `popup.js`:
    - Remove any code handling the "Toggle Status" button
    - Ensure everything still works without the removed button

The goal is not to restyle everything, but to bring clarity and structure while remaining consistent with the extension's minimal footprint and no-framework policy.
