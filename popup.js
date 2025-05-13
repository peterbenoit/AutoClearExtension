// popup.js

document.addEventListener('DOMContentLoaded', async () => {
	const domainDisplay = document.getElementById('current-domain');
	const statusDisplay = document.getElementById('current-status');
	const toggleButton = document.getElementById('toggle-button');

	let currentDomain = '';
	let currentRule = null;

	// Get active tab's URL and extract domain
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab && tab.url) {
			const url = new URL(tab.url);
			currentDomain = url.hostname;
			domainDisplay.textContent = currentDomain;
		} else {
			domainDisplay.textContent = 'N/A';
			statusDisplay.textContent = 'Unable to determine domain.';
			toggleButton.disabled = true;
			return;
		}
	} catch (error) {
		console.error('Error getting active tab:', error);
		domainDisplay.textContent = 'Error';
		statusDisplay.textContent = 'Could not get tab information.';
		toggleButton.disabled = true;
		return;
	}

	// Query chrome.storage.local for its current rule
	try {
		const rules = await chrome.storage.local.get('domainRules');
		if (rules.domainRules && rules.domainRules[currentDomain]) {
			currentRule = rules.domainRules[currentDomain];
		} else {
			// Default to "off" if no specific rule exists
			currentRule = { mode: "off" };
		}
		updateStatusDisplay();
	} catch (error) {
		console.error('Error getting domain rules:', error);
		statusDisplay.textContent = 'Error loading rules.';
		toggleButton.disabled = true;
		return;
	}

	function updateStatusDisplay() {
		if (!currentRule) {
			statusDisplay.textContent = 'N/A';
			return;
		}
		switch (currentRule.mode) {
			case 'blacklist':
				statusDisplay.textContent = 'Clearing on load';
				break;
			case 'allow':
				statusDisplay.textContent = `Allowing for ${currentRule.ttl} minutes`;
				break;
			case 'off':
			default:
				statusDisplay.textContent = 'Not clearing (Off)';
				break;
		}
	}

	toggleButton.addEventListener('click', async () => {
		if (!currentDomain) return;

		// Determine next state
		let nextMode;
		let nextRule = { ...currentRule }; // clone current rule

		switch (currentRule ? currentRule.mode : "off") {
			case 'off':
				nextMode = 'blacklist';
				delete nextRule.ttl; // Remove ttl if switching to blacklist
				break;
			case 'blacklist':
				nextMode = 'allow';
				nextRule.ttl = 60; // Default TTL, can be made configurable
				break;
			case 'allow':
				nextMode = 'off';
				delete nextRule.ttl; // Remove ttl if switching to off
				break;
			default:
				nextMode = 'off';
				delete nextRule.ttl;
				break;
		}
		nextRule.mode = nextMode;

		try {
			const rulesResult = await chrome.storage.local.get('domainRules');
			const allRules = rulesResult.domainRules || {};
			if (nextMode === 'off') {
				// If switching to 'off', we can remove the rule for this domain
				// or explicitly set it to { mode: 'off' }
				// For simplicity, let's explicitly set it.
				allRules[currentDomain] = { mode: 'off' };
			} else {
				allRules[currentDomain] = nextRule;
			}
			await chrome.storage.local.set({ domainRules: allRules });
			currentRule = nextRule;
			updateStatusDisplay();
		} catch (error) {
			console.error('Error updating domain rule:', error);
			statusDisplay.textContent = 'Error saving rule.';
		}
	});
});
