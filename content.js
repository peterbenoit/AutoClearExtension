// content.js

function clearAllStorage() {
	try {
		// Clear localStorage
		localStorage.clear();
		// console.log('localStorage cleared by AutoClear Extension.');

		// Clear sessionStorage
		sessionStorage.clear();
		// console.log('sessionStorage cleared by AutoClear Extension.');

		// Delete all IndexedDB databases
		if (indexedDB && indexedDB.databases) {
			indexedDB.databases().then(databases => {
				if (databases.length === 0) {
					// console.log('No IndexedDB databases found to clear.');
					return;
				}
				databases.forEach(db => {
					const deleteRequest = indexedDB.deleteDatabase(db.name);
					deleteRequest.onsuccess = () => {
						// console.log(`IndexedDB database "${db.name}" deleted successfully by AutoClear Extension.`);
					};
					deleteRequest.onerror = (event) => {
						// console.error(`Error deleting IndexedDB database "${db.name}":`, event.target.error);
					};
					deleteRequest.onblocked = () => {
						// console.warn(`Deletion of IndexedDB database "${db.name}" is blocked. Close other connections.`);
					};
				});
			}).catch(error => {
				// console.error('Error listing IndexedDB databases:', error);
			});
		} else if (indexedDB) {
			// Fallback for browsers that do not support indexedDB.databases()
			// console.warn('indexedDB.databases() is not supported. Specific database names are required to delete them without this API.');
		} else {
			// console.log('IndexedDB API not available.');
		}

	} catch (error) {
		// console.error('Error during storage clearing operation:', error);
	}
}

// Initial clear on page load as per original functionality
// clearAllStorage(); // Commented out as per segment.05 instructions to only clear on demand

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// console.log('Message received in content script:', request);
	if (request.action === "clearStorage") { // Changed from "clear-storage" to match background.js
		// console.log('Received clearStorage command, clearing all storage...');
		clearAllStorage();
		sendResponse({ status: "success", message: "Storage cleared on command." });
		return true; // Indicates that the response is sent asynchronously
	}
	// Optional: handle other actions or send a default response
	sendResponse({ status: "noop", message: "No action taken." });
	return true; // Keep channel open for other listeners or async response
});

// The original direct clearing logic has been moved into clearAllStorage
// and is now triggered by a message or potentially on initial load if uncommented.
