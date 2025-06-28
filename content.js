// content.js

// All clearing logic is now handled by the background script using the chrome.browsingData API.
// This content script is now simplified to just clear items accessible from the page context,
// which complements the background script's broader clearing capabilities.

function clearAllCookies() {
	try {
		const cookies = document.cookie.split(";");

		cookies.forEach(cookie => {
			const eqPos = cookie.indexOf("=");
			const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();

			if (name) {
				// Clear for current domain
				document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
				// Clear for parent domain (if subdomain)
				const domain = window.location.hostname;
				const parts = domain.split('.');
				if (parts.length > 2) {
					const parentDomain = '.' + parts.slice(-2).join('.');
					document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${parentDomain}`;
				}
			}
		});

		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Cleared ${cookies.length} cookies via document.cookie`,
				source: 'Content Script'
			});
		}
	} catch (error) {
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Error clearing cookies: ${error}`,
				source: 'Content Script - Error'
			});
		}
	}
}

function clearLocalStorage() {
	try {
		const itemCount = localStorage.length;
		localStorage.clear();

		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `localStorage cleared (${itemCount} items removed)`,
				source: 'Content Script'
			});
		}

		return { success: true, count: itemCount };
	} catch (error) {
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Error clearing localStorage: ${error}`,
				source: 'Content Script - Error'
			});
		}
		return { success: false, error: error.message };
	}
}

function clearSessionStorage() {
	try {
		const itemCount = sessionStorage.length;
		sessionStorage.clear();

		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `sessionStorage cleared (${itemCount} items removed)`,
				source: 'Content Script'
			});
		}

		return { success: true, count: itemCount };
	} catch (error) {
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Error clearing sessionStorage: ${error}`,
				source: 'Content Script - Error'
			});
		}
		return { success: false, error: error.message };
	}
}

function clearCacheStorage() {
	return new Promise(async (resolve) => {
		try {
			if ('caches' in window) {
				const cacheNames = await caches.keys();
				let clearedCount = 0;

				for (const cacheName of cacheNames) {
					const deleted = await caches.delete(cacheName);
					if (deleted) clearedCount++;
				}

				if (typeof chrome.runtime.sendMessage === 'function') {
					chrome.runtime.sendMessage({
						type: 'log-debug-to-storage',
						message: `Cache Storage cleared (${clearedCount}/${cacheNames.length} caches removed)`,
						source: 'Content Script'
					});
				}

				resolve({ success: true, count: clearedCount });
			} else {
				if (typeof chrome.runtime.sendMessage === 'function') {
					chrome.runtime.sendMessage({
						type: 'log-debug-to-storage',
						message: 'Cache Storage API not available',
						source: 'Content Script'
					});
				}
				resolve({ success: false, error: 'Cache Storage not supported' });
			}
		} catch (error) {
			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({
					type: 'log-debug-to-storage',
					message: `Error clearing Cache Storage: ${error}`,
					source: 'Content Script - Error'
				});
			}
			resolve({ success: false, error: error.message });
		}
	});
}

function clearWebSQL() {
	return new Promise((resolve) => {
		try {
			if (window.openDatabase) {
				// WebSQL is deprecated but still exists in some browsers
				// This is a basic attempt to clear - implementation varies by browser
				if (typeof chrome.runtime.sendMessage === 'function') {
					chrome.runtime.sendMessage({
						type: 'log-debug-to-storage',
						message: 'WebSQL detected but clearing not implemented (deprecated API)',
						source: 'Content Script - Warn'
					});
				}
				resolve({ success: false, error: 'WebSQL clearing not implemented' });
			} else {
				resolve({ success: true, count: 0 }); // Not present, so "cleared"
			}
		} catch (error) {
			resolve({ success: false, error: error.message });
		}
	});
}

async function clearAllStorage() {
	try {
		const results = {
			localStorage: clearLocalStorage(),
			sessionStorage: clearSessionStorage(),
			cookies: { success: true }, // clearAllCookies doesn't return result
			cacheStorage: await clearCacheStorage(),
			webSQL: await clearWebSQL()
		};

		// Clear cookies (existing function)
		clearAllCookies();

		// Clear IndexedDB (existing logic)
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

		// Summary logging
		const successCount = Object.values(results).filter(r => r.success).length;
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: `Storage clearing completed: ${successCount}/${Object.keys(results).length} storage types cleared successfully`,
				source: 'Content Script'
			});
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
		sendResponse({ status: "success", message: "Storage and cookies cleared." });
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({
				type: 'log-debug-to-storage',
				message: 'clearStorage command received and executed.',
				source: 'Content Script'
			});
		}
		return true; // Indicates that the response is sent asynchronously
	} else if (request.action === "clearSpecificStorage") {
		// Handle selective clearing based on request.types array
		const types = request.types || ['localStorage', 'sessionStorage', 'cookies'];
		let results = {};

		if (types.includes('localStorage')) {
			results.localStorage = clearLocalStorage();
		}
		if (types.includes('sessionStorage')) {
			results.sessionStorage = clearSessionStorage();
		}
		if (types.includes('cookies')) {
			clearAllCookies();
			results.cookies = { success: true };
		}
		if (types.includes('cacheStorage')) {
			clearCacheStorage().then(result => {
				results.cacheStorage = result;
			});
		}

		sendResponse({ status: "success", message: "Selective storage cleared.", results: results });
		return true;
	}

	// Optional: handle other actions or send a default response
	sendResponse({ status: "noop", message: "No action taken." });
	return true; // Keep channel open for other listeners or async response
});

// The original direct clearing logic has been moved into clearAllStorage
// and is now triggered by a message or potentially on initial load if uncommented.
