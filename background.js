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

// --- Cookie Clearing Logic ---
const clearedCookiesForTab = {}; // Stores tabId: Set<domain> for which cookies have been cleared

async function clearCookiesForDomain(domain, tabId, source = 'Automatic') {
	if (!domain) return;

	// Normalize domain to account for common mismatches such as www. and leading dots.
	const normalizedDomain = domain.startsWith('www.') ? domain.slice(4) : domain;

	try {
		const allCookies = await chrome.cookies.getAll({});
		const cookies = allCookies.filter(cookie =>
			cookie.domain.replace(/^\./, '') === normalizedDomain
		);
		if (cookies.length === 0) {
			logDebugMessage(`(${source}) No cookies found for domain: ${domain}`);
			return;
		}

		let clearedCount = 0;
		for (const cookie of cookies) {
			const protocol = cookie.secure ? 'https://' : 'http://';
			// The URL must be absolute and start with http/https.
			// Cookie domain might start with '.', remove it for URL construction.
			const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
			const url = protocol + cookieDomain + cookie.path;
			try {
				await chrome.cookies.remove({ url: url, name: cookie.name });
				clearedCount++;
				// Detailed debug log for each cookie removed
				logDebugMessage(`(${source}) Cookie removed: ${cookie.name} (domain: ${cookie.domain}, path: ${cookie.path}, secure: ${cookie.secure}, httpOnly: ${cookie.httpOnly})`);
			} catch (removeError) {
				console.warn(`[AutoClear] Error removing cookie ${cookie.name} for URL ${url}:`, removeError);
				logDebugMessage(`(${source}) Error removing cookie ${cookie.name} from ${domain}: ${removeError.message}`, 'Error');
			}
		}

		if (clearedCount > 0) {
			logDebugMessage(`(${source}) Cleared ${clearedCount} cookie(s) for domain: ${domain}`);
		}
		// Mark cookies as cleared for this domain on this tab
		if (tabId) {
			if (!clearedCookiesForTab[tabId]) {
				clearedCookiesForTab[tabId] = new Set();
			}
			clearedCookiesForTab[tabId].add(domain);
		}

	} catch (error) {
		console.error(`[AutoClear] Error getting cookies for domain ${domain}:`, error);
		logDebugMessage(`(${source}) Error getting cookies for ${domain}: ${error.message}`, 'Error');
	}
}
// --- End Cookie Clearing Logic ---

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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	await checkAndExpireTTLRules(); // Run expiration check

	// Update badge if the updated tab is the active one and its URL or status might have changed badge state
	if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
		// console.log(`[AutoClear] Active tab ${tabId} updated. URL: ${tab.url}, Status: ${changeInfo.status}, changeInfo.url: ${changeInfo.url}`);
		const domain = getDomainFromUrl(tab.url);
		await updateIconBadge(domain);
	}

	let urlToProcess = null;
	// Prioritize changeInfo.url if available (direct navigation)
	if (changeInfo.url) {
		urlToProcess = changeInfo.url;
	} else if (changeInfo.status === 'complete' && tab && tab.url) {
		// Fallback to tab.url when page load completes, to catch cases where changeInfo.url wasn't present
		// or to re-evaluate rules upon full page load.
		urlToProcess = tab.url;
	}

	if (urlToProcess) {
		const domain = getDomainFromUrl(urlToProcess);
		if (domain) {
			const rule = await getDomainRules(domain); // This gets the effective rule
			// console.log(`[AutoClear] Effective rule for ${domain} on tab ${tabId} update:`, rule);
			if (rule && rule.mode === 'blacklist') {
				// console.log(`[AutoClear] Blacklist rule for ${domain}, sending clearStorage to tab ${tabId}`);
				// Clear storage
				chrome.tabs.sendMessage(tabId, { action: "clearStorage" }, (response) => {
					if (chrome.runtime.lastError) {
						// console.warn(`[AutoClear] Error sending clearStorage to tab ${tabId} for ${domain}: ${chrome.runtime.lastError.message}`);
						logDebugMessage(`Error sending clearStorage to tab ${tabId} for ${domain}: ${chrome.runtime.lastError.message}`, 'Error');
					} else {
						// console.log(`[AutoClear] clearStorage message sent to tab ${tabId} for ${domain}. Response:`, response ? JSON.stringify(response) : 'No response');
						logDebugMessage(`clearStorage message sent to tab ${tabId} for ${domain}. Response: ${response ? JSON.stringify(response) : 'No response'}`);
					}
				});

				// Clear cookies if not already done for this domain on this tab in this "session"
				// A simple check: if the URL itself changed, we might want to re-clear.
				// Or, if it's the first time we're seeing this blacklisted domain on this tab.
				if (!clearedCookiesForTab[tabId] || !clearedCookiesForTab[tabId].has(domain) || changeInfo.url) {
					if (changeInfo.url) { // If URL changed, reset cookie cleared status for this tab
						if (clearedCookiesForTab[tabId]) clearedCookiesForTab[tabId].clear();
					}
					await clearCookiesForDomain(domain, tabId, 'Automatic - Tab Update');
				}
			} else {
				// If domain is no longer blacklisted (or never was), clear its tracking from clearedCookiesForTab for this tab
				if (clearedCookiesForTab[tabId]) {
					clearedCookiesForTab[tabId].delete(domain);
				}
			}
		}
	}
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	await checkAndExpireTTLRules(); // Run expiration check
	// console.log(`[AutoClear] Tab ${tabId} was removed. TTL rules checked. No message sent as content script is inactive.`);
	// Clean up cookie clearing tracking for the removed tab
	if (clearedCookiesForTab[tabId]) {
		delete clearedCookiesForTab[tabId];
		logDebugMessage(`Cleaned cookie clearing state for closed tab ${tabId}.`);
	}
	// If the removed tab was active, the onActivated event for the new active tab will handle the badge.
	// Or, we could check if the removed tab was active and clear the badge if no other tabs are left or focus changes.
	// For simplicity, onActivated will handle the new active tab's badge.
});

// New listener for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	// console.log(`[AutoClear] Tab activated: ${activeInfo.tabId}`);
	await checkAndExpireTTLRules(); // Ensure rules are fresh
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		if (tab && tab.url) {
			const domain = getDomainFromUrl(tab.url);
			await updateIconBadge(domain);

			// Also check if cookies need to be cleared for the newly activated tab's domain
			if (domain) {
				const rule = await getDomainRules(domain);
				if (rule && rule.mode === 'blacklist') {
					// Check if cookies were already cleared for this domain on this tab
					// This simple check might re-clear if user switches tabs back and forth.
					// More sophisticated "session" tracking might be needed if this is too aggressive.
					// For now, we clear if not in the set for this tab.
					if (!clearedCookiesForTab[activeInfo.tabId] || !clearedCookiesForTab[activeInfo.tabId].has(domain)) {
						await clearCookiesForDomain(domain, activeInfo.tabId, 'Automatic - Tab Activated');
					}
				}
			}
		} else {
			await updateIconBadge(null); // Clear badge if tab has no URL (e.g. new tab page before navigation)
		}
	} catch (error) {
		// console.warn(`[AutoClear] Error getting tab info on activation for tab ${activeInfo.tabId}:`, error.message);
		await updateIconBadge(null); // Clear badge on error
	}
});

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
			if (request.domain) {
				await clearCookiesForDomain(request.domain, null, 'Manual'); // tabId is null for manual clear from popup
				sendResponse({ status: "success", message: `Cookies cleared for ${request.domain}` });
			} else {
				sendResponse({ status: "error", message: "No domain specified for cookie clearing." });
			}
		})();
		return true; // Indicates async response
	}
	// Return false or undefined if the message is not handled, or not handled asynchronously.
	// This allows other listeners to process the message.
	return false;
});

// Initialize on startup
initializeDomainRules().then(async (rules) => { // Made the callback async
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
