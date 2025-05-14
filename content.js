// content.js

function clearAllStorage() {
	try {
		// Clear localStorage
		localStorage.clear();
		// console.log('localStorage cleared by AutoClear Extension.');
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: 'localStorage cleared.',
				source: 'Content Script'
			});
		}

		// Clear sessionStorage
		sessionStorage.clear();
		// console.log('sessionStorage cleared by AutoClear Extension.');
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: 'sessionStorage cleared.',
				source: 'Content Script'
			});
		}

		// Delete all IndexedDB databases
		if (indexedDB && indexedDB.databases) {
			indexedDB.databases().then(databases => {
				if (databases.length === 0) {
					// console.log('No IndexedDB databases found to clear.');
					if (typeof chrome.runtime.sendMessage === 'function') {
						chrome.runtime.sendMessage({
							type: 'log-debug-to-storage',
							message: 'No IndexedDB databases found to clear.',
							source: 'Content Script'
						});
					}
					return;
				}
				databases.forEach(db => {
					const deleteRequest = indexedDB.deleteDatabase(db.name);
					deleteRequest.onsuccess = () => {
						// console.log(`IndexedDB database "${db.name}" deleted successfully by AutoClear Extension.`);
						if (typeof chrome.runtime.sendMessage === 'function') {
							chrome.runtime.sendMessage({
								type: 'log-debug-to-storage',
								message: `IndexedDB database "${db.name}" deleted successfully.`,
								source: 'Content Script'
							});
						}
					};
					deleteRequest.onerror = (event) => {
						// console.error(`Error deleting IndexedDB database "${db.name}":`, event.target.error);
						if (typeof chrome.runtime.sendMessage === 'function') {
							chrome.runtime.sendMessage({
								type: 'log-debug-to-storage',
								message: `Error deleting IndexedDB database "${db.name}": ${event.target.error}`,
								source: 'Content Script - Error'
							});
						}
					};
					deleteRequest.onblocked = () => {
						// console.warn(`Deletion of IndexedDB database "${db.name}" is blocked. Close other connections.`);
						if (typeof chrome.runtime.sendMessage === 'function') {
							chrome.runtime.sendMessage({
								type: 'log-debug-to-storage',
								message: `Deletion of IndexedDB database "${db.name}" is blocked.`,
								source: 'Content Script - Warn'
							});
						}
					};
				});
			}).catch(error => {
				// console.error('Error listing IndexedDB databases:', error);
				if (typeof chrome.runtime.sendMessage === 'function') {
					chrome.runtime.sendMessage({
						type: 'log-debug-to-storage',
						message: `Error listing IndexedDB databases: ${error}`,
						source: 'Content Script - Error'
					});
				}
			});
		} else if (indexedDB) {
			// Fallback for browsers that do not support indexedDB.databases()
			// console.warn('indexedDB.databases() is not supported. Specific database names are required to delete them without this API.');
			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({
					type: 'log-debug-to-storage',
					message: 'indexedDB.databases() not supported. Cannot list all DBs for deletion.',
					source: 'Content Script - Warn'
				});
			}
		} else {
			// console.log('IndexedDB API not available.');
			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({
					type: 'log-debug-to-storage',
					message: 'IndexedDB API not available.',
					source: 'Content Script'
				});
			}
		}

	} catch (error) {
		// console.error('Error during storage clearing operation:', error);
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Error during storage clearing operation: ${error}`,
				source: 'Content Script - Error'
			});
		}
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
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: 'clearStorage command received and executed.',
				source: 'Content Script'
			});
		}
		return true; // Indicates that the response is sent asynchronously
	}
	// Optional: handle other actions or send a default response
	sendResponse({ status: "noop", message: "No action taken." });
	return true; // Keep channel open for other listeners or async response
});

// The original direct clearing logic has been moved into clearAllStorage
// and is now triggered by a message or potentially on initial load if uncommented.
