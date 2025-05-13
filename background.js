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
});

// Initialize on startup
initializeDomainRules().then(async (rules) => { // Made the callback async
	// console.log('[AutoClear] Domain rules initialized:', rules);
	await checkAndExpireTTLRules(); // Initial check on startup

	// Set up periodic check for TTL expiration
	setInterval(checkAndExpireTTLRules, 10 * 60 * 1000); // Every 10 minutes
	// console.log('[AutoClear] TTL rule expiration check interval (10 min) started.');
});
