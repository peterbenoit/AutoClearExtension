// background.js

const defaultDomainRules = {
	"medium.com": { "mode": "blacklist" },
	"example.com": { "mode": "allow", "ttl": 60 }
};

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
			}
		}

		if (rulesChanged) {
			await new Promise(resolve => chrome.storage.local.set({ domainRules: allRules }, resolve));
			// console.log('[AutoClear] Updated domain rules after expiring TTLs.');
		}
	} catch (error) {
		// console.error('[AutoClear] Error in checkAndExpireTTLRules:', error);
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
				chrome.tabs.sendMessage(tabId, { action: "clearStorage" }, (response) => {
					if (chrome.runtime.lastError) {
						// console.warn(`[AutoClear] Error sending clearStorage to tab ${tabId} for ${domain}: ${chrome.runtime.lastError.message}`);
					} else {
						// console.log(`[AutoClear] clearStorage message sent to tab ${tabId} for ${domain}. Response:`, response ? JSON.stringify(response) : 'No response');
					}
				});
			}
		}
	}
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	await checkAndExpireTTLRules(); // Run expiration check
	// console.log(`[AutoClear] Tab ${tabId} was removed. TTL rules checked. No message sent as content script is inactive.`);
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
	// Return false or undefined if the message is not handled, or not handled asynchronously.
	// This allows other listeners to process the message.
	return false;
});

// Initialize on startup
initializeDomainRules().then(async (rules) => { // Made the callback async
	// console.log('[AutoClear] Domain rules initialized:', rules);
	await checkAndExpireTTLRules(); // Initial check on startup

	// Set up periodic check for TTL expiration
	setInterval(checkAndExpireTTLRules, 10 * 60 * 1000); // Every 10 minutes
	// console.log('[AutoClear] TTL rule expiration check interval (10 min) started.');

	// Set initial badge for currently active tab
	try {
		const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (activeTab && activeTab.id && activeTab.url) {
			// console.log(`[AutoClear] Setting initial badge for active tab ${activeTab.id}`);
			const domain = getDomainFromUrl(activeTab.url);
			await updateIconBadge(domain);
		} else {
			// console.log('[AutoClear] No active tab found on startup to set initial badge, or active tab has no URL.');
			await updateIconBadge(null); // No active tab with URL, clear badge
		}
	} catch (error) {
		// console.error('[AutoClear] Error setting initial badge:', error.message);
		await updateIconBadge(null); // Clear badge on error
	}
});
