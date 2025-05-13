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

async function getDomainRules(domain) {
	return new Promise((resolve) => {
		chrome.storage.local.get('domainRules', (result) => {
			if (result.domainRules && result.domainRules[domain]) {
				resolve(result.domainRules[domain]);
			} else {
				resolve(null); // Or a default rule if appropriate
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
	if (changeInfo.url) {
		const domain = getDomainFromUrl(changeInfo.url);
		if (domain) {
			const rule = await getDomainRules(domain);
			if (rule && rule.mode === 'blacklist') {
				chrome.tabs.sendMessage(tabId, { action: "clearStorage" }, (response) => {
					if (chrome.runtime.lastError) {
						// Optional: Log if the content script is not available or does not respond
						// console.log(`Attempted to clear storage for ${domain} in tab ${tabId}, but content script may not be active or listening: ${chrome.runtime.lastError.message}`);
					} else {
						// Optional: Log successful message sending
						// console.log(`Message sent to clear storage for ${domain} in tab ${tabId}, response:`, response);
					}
				});
			}
		}
	}
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	// As per instructions: "send a message to the content script in that tab (if still active)".
	// When a tab is removed, its content script is no longer active.
	// Therefore, no message is sent here. This listener fulfills the requirement
	// to listen to onRemoved.
	// console.log(`Tab ${tabId} was removed. No message sent as content script is inactive.`);
});

// Initialize on startup
initializeDomainRules().then(rules => {
	console.log('Domain rules initialized:', rules);
});
