// background.js

const defaultDomainRules = {
	"medium.com": { "mode": "blacklist" },
	"example.com": { "mode": "allow", "ttl": 60 }
};

chrome.cookies.getAll({ domain: 'medium.com' }, cookies => {
	console.table(cookies.map(c => ({
		name: c.name,
		value: c.value,
		domain: c.domain,
		path: c.path,
		httpOnly: c.httpOnly,
		secure: c.secure,
		sameSite: c.sameSite,
		storeId: c.storeId
	})));
});

let tabUrls = {}; // To track the URL of each tab

async function initializeDomainRules() {
	return new Promise((resolve) => {
		chrome.storage.local.get('domainRules', (result) => {
			if (result.domainRules) {
				resolve(result.domainRules);
			} else {
				chrome.storage.local.set({ domainRules: defaultDomainRules }, () => {
					resolve(defaultDomainRules);
				});
			}
		});
	});
}

const MAX_DEBUG_LOG_ENTRIES = 50;

async function logDebugMessage(message, source = 'Background') {
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp} - ${source}] ${message}`;

	console.log(logEntry); // Keep console logging for live debugging

	try {
		const result = await new Promise(resolve => chrome.storage.local.get('debugLog', resolve));
		let logs = result.debugLog || [];
		logs.unshift(logEntry); // Add new entry to the beginning (most recent first)
		if (logs.length > MAX_DEBUG_LOG_ENTRIES) {
			logs = logs.slice(0, MAX_DEBUG_LOG_ENTRIES); // Cap log size
		}
		await new Promise(resolve => chrome.storage.local.set({ debugLog: logs }, resolve));

		// Notify popup if it's open to refresh its log view
		if (typeof chrome.runtime.sendMessage === 'function') {
			chrome.runtime.sendMessage({ type: 'debug-log-updated' }, () => {
				// Check chrome.runtime.lastError to avoid errors if no popup is listening
				if (chrome.runtime.lastError) {
					// console.log('logDebugMessage: Popup not open or error sending message: ' + chrome.runtime.lastError.message);
				}
			});
		}
	} catch (error) {
		console.error('[AutoClear Background] Error in logDebugMessage:', error);
	}
}

// New function to check and expire TTL rules
async function checkAndExpireTTLRules() {
	// console.log('[AutoClear] Checking for expired TTL rules...');
	try {
		const result = await new Promise(resolve => chrome.storage.local.get('domainRules', resolve));
		let allRules = result.domainRules || {};
		let rulesChanged = false;
		const now = Date.now();

		for (const domain in allRules) {
			const rule = allRules[domain];
			if (rule.mode === 'allow' && rule.expiresAt && now >= rule.expiresAt) {
				// console.log(`[AutoClear] TTL for domain "${domain}" expired at ${new Date(rule.expiresAt).toISOString()}. Changing to blacklist.`);
				allRules[domain] = { mode: 'blacklist' }; // Convert to blacklist, implicitly removing ttlMinutes and expiresAt
				rulesChanged = true;
				logDebugMessage(`TTL for domain "${domain}" expired. Changed to blacklist.`);
			}
		}

		if (rulesChanged) {
			await new Promise(resolve => chrome.storage.local.set({ domainRules: allRules }, resolve));
			// console.log('[AutoClear] Updated domain rules after expiring TTLs.');
			logDebugMessage('Updated domain rules after expiring TTLs.');
		}
	} catch (error) {
		// console.error('[AutoClear] Error in checkAndExpireTTLRules:', error);
		logDebugMessage(`Error in checkAndExpireTTLRules: ${error.message}`, 'Error');
	}
}

// Modified getDomainRules to return the *effective* rule, respecting TTL
async function getDomainRules(domain) {
	return new Promise((resolve) => {
		chrome.storage.local.get('domainRules', (result) => {
			if (result.domainRules && result.domainRules[domain]) {
				let rule = result.domainRules[domain]; // Get the stored rule

				// Check if it's an "allow" rule and if it has expired
				if (rule.mode === 'allow' && rule.expiresAt && Date.now() >= rule.expiresAt) {
					// console.log(`[AutoClear] TTL for ${domain} has expired. Effective rule: blacklist.`);
					// This rule is effectively a blacklist now for immediate decision making.
					// checkAndExpireTTLRules will handle persisting this change to storage.
					logDebugMessage(`TTL for ${domain} has expired. Effective rule: blacklist.`);
					resolve({ mode: 'blacklist' });
					return;
				}
				// If not expired, or not an "allow" rule with TTL, resolve with the rule as is.
				resolve(rule);
			} else {
				resolve(null); // No specific rule for this domain
			}
		});
	});
}

async function updateDomainRule(domain, rule) {
	return new Promise((resolve) => {
		chrome.storage.local.get('domainRules', (result) => {
			const rules = result.domainRules || {};
			rules[domain] = rule;
			chrome.storage.local.set({ domainRules: rules }, () => {
				resolve(rules);
			});
		});
	});
}

// Export helper functions
globalThis.initializeDomainRules = initializeDomainRules;
globalThis.getDomainRules = getDomainRules;
globalThis.updateDomainRule = updateDomainRule;

// --- New/Refactored Core Logic Functions ---

async function shouldClearForDomain(domain) {
	if (!domain) return false;
	const rule = await getDomainRules(domain); // getDomainRules handles TTL expiry for effective rule
	return rule && rule.mode === 'blacklist';
}

// REWRITTEN to use browsingData API for robust clearing
async function clearAllStorageForDomain(domain, source = 'Automatic') {
	if (!domain) return;
	logDebugMessage(`(${source}) Requesting comprehensive storage clear for ${domain}`);

	const origin = `https://${domain}`;
	try {
		await chrome.browsingData.remove({
			origins: [origin]
		}, {
			"cacheStorage": true,
			"cookies": true,
			"fileSystems": true,
			"indexedDB": true,
			"localStorage": true,
			"serviceWorkers": true,
			"webSQL": true
		});
		logDebugMessage(`(${source}) Successfully cleared storage for origin: ${origin}`);
		return { success: true };
	} catch (error) {
		logDebugMessage(`(${source}) Error clearing storage for origin ${origin}: ${error.message}`, 'Error');
		return { success: false, error: error.message };
	}
}

// --- Event Handler Functions ---

// REWRITTEN to clear when LEAVING a blacklisted domain
async function handleTabUpdate(tabId, changeInfo, tab) {
	await checkAndExpireTTLRules();

	// Update badge for the current tab
	if (tab.active) {
		const domainForBadge = getDomainFromUrl(tab.url);
		await updateIconBadge(domainForBadge);
	}

	// If URL changed, check if we should clear storage for the *previous* domain
	if (changeInfo.url) {
		const previousUrl = tabUrls[tabId];
		if (previousUrl) {
			const previousDomain = getDomainFromUrl(previousUrl);
			if (previousDomain && previousDomain !== getDomainFromUrl(changeInfo.url)) {
				if (await shouldClearForDomain(previousDomain)) {
					await clearAllStorageForDomain(previousDomain, 'Automatic - Tab Navigation');
				}
			}
		}
		// Update the stored URL for the tab
		tabUrls[tabId] = changeInfo.url;
	}
}

// REWRITTEN to clear when CLOSING a blacklisted tab
async function handleTabRemoval(tabId, removeInfo) {
	await checkAndExpireTTLRules();
	const closedUrl = tabUrls[tabId];
	if (closedUrl) {
		const closedDomain = getDomainFromUrl(closedUrl);
		if (closedDomain && await shouldClearForDomain(closedDomain)) {
			await clearAllStorageForDomain(closedDomain, 'Automatic - Tab Closed');
		}
		// Clean up the stored URL
		delete tabUrls[tabId];
	}
	logDebugMessage(`Tab ${tabId} closed.`);
}

// REWRITTEN to only handle badge updates, not clearing
async function handleTabActivation(activeInfo) {
	await checkAndExpireTTLRules();
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		if (tab && tab.url) {
			const domain = getDomainFromUrl(tab.url);
			await updateIconBadge(domain);
		} else {
			await updateIconBadge(null);
		}
	} catch (error) {
		logDebugMessage(`Error getting tab info on activation for tab ${activeInfo.tabId}: ${error.message}`, 'Error');
		await updateIconBadge(null);
	}
}

// Helper function to update the extension icon badge
async function updateIconBadge(domain) {
	// console.log(`[AutoClear] Updating global badge for domain: ${domain}`);
	let badgeText = '';
	let badgeColor = '#FFFFFF'; // Default color, not really used if text is empty

	if (!domain) {
		// console.log(`[AutoClear] No processable domain for active tab. Clearing badge.`);
	} else {
		const rule = await getDomainRules(domain); // This gets the effective rule
		// console.log(`[AutoClear] Rule for active domain ${domain}:`, rule);
		if (rule) {
			switch (rule.mode) {
				case 'blacklist':
					badgeText = 'CLR';
					badgeColor = '#D93025'; // Red
					break;
				case 'allow': // TTL active (getDomainRules ensures it's not expired if mode is 'allow')
					badgeText = 'TMP';
					badgeColor = '#FFA500'; // Orange
					break;
				case 'off':
				default:
					// badgeText remains ''
					break;
			}
		}
	}

	try {
		await chrome.action.setBadgeText({ text: badgeText });
		if (badgeText) {
			await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
		}
		// console.log(`[AutoClear] Global badge set to "${badgeText}" with color ${badgeColor}`);
	} catch (e) {
		// console.error(`[AutoClear] Error setting global badge: ${e.message}`);
	}
}

function getDomainFromUrl(urlString) {
	try {
		const url = new URL(urlString);
		// Only process http and https protocols for domain extraction
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return url.hostname;
		}
		return null;
	} catch (e) {
		// console.warn('Could not parse URL for domain:', urlString, e);
		return null;
	}
}

// Event Listeners
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.tabs.onActivated.addListener(handleTabActivation);

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// Added to prevent interference with the new debug log listener in popup.js
	// if (request.type === 'debug-log') { // This specific check is no longer needed as popup won't send this type
	// 	return false;
	// }

	if (request.type === 'log-debug-to-storage') {
		// Message from popup or content script to log something
		let source = 'Unknown';
		if (sender.tab && sender.tab.url) { // From content script
			try {
				source = `Content Script (${new URL(sender.tab.url).hostname})`;
			} catch (e) { source = 'Content Script'; }
		} else if (sender.id === chrome.runtime.id && !sender.tab) { // From popup
			source = request.source || 'Popup'; // Allow source to be specified in request
		}
		logDebugMessage(request.message, source);
		// No sendResponse needed, or send simple ack
		sendResponse({ status: 'debug logged' });
		return true; // Indicate async response if any part of logDebugMessage was async (it is)
	}

	if (request.action === "refreshBadgeForDomain") {
		(async () => {
			// console.log(`[AutoClear Background] Received request to refresh badge for domain ${request.domain}`);
			const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			// Only update if the domain from popup matches current active tab's domain
			if (activeTab && activeTab.url && getDomainFromUrl(activeTab.url) === request.domain) {
				await checkAndExpireTTLRules(); // Ensure rules are fresh before badge update
				await updateIconBadge(request.domain);
				sendResponse({ status: "badge refresh triggered for active domain" });
			} else {
				// console.log('[AutoClear Background] Badge refresh request for non-active domain or no active tab. No badge change.');
				sendResponse({ status: "badge refresh not applicable for non-active domain" });
			}
		})();
		return true; // Indicates async response
	}

	if (request.action === "manualClearCookies") {
		(async () => {
			if (request.domain) { // tabId is no longer needed
				const result = await clearAllStorageForDomain(request.domain, 'Manual');
				if (result.success) {
					sendResponse({ status: "success", message: `All storage cleared for ${request.domain}` });
				} else {
					sendResponse({ status: "error", message: result.error || "Failed to clear storage" });
				}
			} else {
				sendResponse({ status: "error", message: "No domain specified for clearing." });
			}
		})();
		return true;
	}

	// Return false or undefined if the message is not handled, or not handled asynchronously.
	// This allows other listeners to process the message.
	return false;
});

// Initialize on startup
initializeDomainRules().then(async (rules) => {
	logDebugMessage('Domain rules initialized.', 'System');
	await checkAndExpireTTLRules(); // Initial check on startup

	// Set up periodic check for TTL expiration
	setInterval(checkAndExpireTTLRules, 10 * 60 * 1000); // Every 10 minutes
	logDebugMessage('TTL rule expiration check interval (10 min) started.', 'System');

	// Set initial badge for currently active tab
	try {
		const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (activeTab && activeTab.id && activeTab.url) {
			logDebugMessage(`Setting initial badge for active tab ${activeTab.id}`, 'System');
			const domain = getDomainFromUrl(activeTab.url);
			await updateIconBadge(domain);
		} else {
			logDebugMessage('No active tab found on startup to set initial badge, or active tab has no URL.', 'System');
			await updateIconBadge(null); // No active tab with URL, clear badge
		}
	} catch (error) {
		logDebugMessage(`Error setting initial badge: ${error.message}`, 'Error');
		await updateIconBadge(null); // Clear badge on error
	}
});
