// popup.js

document.addEventListener('DOMContentLoaded', async () => {
	const domainDisplay = document.getElementById('current-domain');
	const ruleDomainDisplay = document.getElementById('rule-domain-display');
	const ruleModeSelect = document.getElementById('rule-mode');
	const ttlSection = document.getElementById('ttl-section');
	const ttlValueInput = document.getElementById('ttl-value');
	const saveRuleButton = document.getElementById('save-rule-button');
	const statusMessage = document.getElementById('status-message');
	const currentRuleText = document.getElementById('current-rule-text');

	let currentDomain = '';
	let activeTabId = null;

	async function getActiveTabInfo() {
		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab && tab.url) {
				const url = new URL(tab.url);
				// Only consider http and https schemes for domain rules
				if (url.protocol === 'http:' || url.protocol === 'https:') {
					currentDomain = url.hostname;
					activeTabId = tab.id;
					domainDisplay.textContent = currentDomain;
					ruleDomainDisplay.textContent = currentDomain;
				} else {
					domainDisplay.textContent = 'N/A (Unsupported Page)';
					ruleDomainDisplay.textContent = 'this page';
					disableControls('Unsupported page protocol.');
					return false;
				}
			} else {
				domainDisplay.textContent = 'N/A';
				ruleDomainDisplay.textContent = 'this page';
				disableControls('Unable to determine current page.');
				return false;
			}
			return true;
		} catch (error) {
			console.error('Error getting active tab:', error);
			domainDisplay.textContent = 'Error';
			ruleDomainDisplay.textContent = 'this page';
			disableControls('Could not get tab information.');
			return false;
		}
	}

	function disableControls(message) {
		ruleModeSelect.disabled = true;
		ttlValueInput.disabled = true;
		saveRuleButton.disabled = true;
		currentRuleText.textContent = message || 'Controls disabled.';
		statusMessage.textContent = '';
	}

	function updateCurrentRuleDisplay(rule) {
		if (!currentDomain) {
			currentRuleText.textContent = "No domain loaded.";
			return;
		}
		if (!rule || !rule.mode || rule.mode === 'off') {
			currentRuleText.textContent = `No specific rule. Default: Do Nothing.`;
		} else if (rule.mode === 'blacklist') {
			currentRuleText.textContent = `Rule: Always Clear.`;
		} else if (rule.mode === 'allow') {
			if (rule.ttl && rule.expiresAt) {
				const remainingMinutes = Math.max(0, Math.round((rule.expiresAt - Date.now()) / 60000));
				currentRuleText.textContent = `Rule: Temporarily Allowed. Expires in ~${remainingMinutes} min.`;
			} else {
				currentRuleText.textContent = `Rule: Temporarily Allowed (TTL not set correctly).`;
			}
		} else {
			currentRuleText.textContent = `Unknown rule state.`;
		}
	}

	async function loadDomainRule() {
		if (!currentDomain) {
			updateCurrentRuleDisplay(null);
			disableControls("No domain to load rule for.");
			return;
		}

		try {
			const result = await chrome.storage.local.get('domainRules');
			const allRules = result.domainRules || {};
			const domainRule = allRules[currentDomain];

			if (domainRule) {
				ruleModeSelect.value = domainRule.mode;
				if (domainRule.mode === 'allow') {
					ttlSection.style.display = 'block';
					// If expiresAt is present, calculate remaining TTL in minutes for display
					if (domainRule.expiresAt) {
						const now = Date.now();
						const remainingTtlMs = Math.max(0, domainRule.expiresAt - now);
						ttlValueInput.value = Math.round(remainingTtlMs / 60000) || 60; // Default to 60 if expired or not set
					} else {
						ttlValueInput.value = domainRule.ttlMinutes || 60; // Use stored ttlMinutes or default
					}
				} else {
					ttlSection.style.display = 'none';
				}
			} else {
				// Default UI state if no rule exists for the domain
				ruleModeSelect.value = 'off';
				ttlSection.style.display = 'none';
				ttlValueInput.value = 60; // Default TTL
			}
			updateCurrentRuleDisplay(domainRule);
			// Enable controls after loading
			ruleModeSelect.disabled = false;
			ttlValueInput.disabled = ruleModeSelect.value !== 'allow';
			saveRuleButton.disabled = false;

		} catch (error) {
			console.error('Error loading domain rule:', error);
			statusMessage.textContent = 'Error loading rule.';
			statusMessage.className = 'status-message error';
			disableControls('Error loading rule.');
			updateCurrentRuleDisplay(null);
		}
	}

	ruleModeSelect.addEventListener('change', () => {
		if (ruleModeSelect.value === 'allow') {
			ttlSection.style.display = 'block';
			ttlValueInput.disabled = false;
		} else {
			ttlSection.style.display = 'none';
			ttlValueInput.disabled = true;
		}
	});

	saveRuleButton.addEventListener('click', async () => {
		if (!currentDomain) {
			statusMessage.textContent = 'No domain selected.';
			statusMessage.className = 'status-message error';
			return;
		}

		const mode = ruleModeSelect.value;
		let newRule = { mode };

		if (mode === 'allow') {
			const ttlMinutes = parseInt(ttlValueInput.value, 10);
			if (isNaN(ttlMinutes) || ttlMinutes <= 0) {
				statusMessage.textContent = 'Please enter a valid TTL in minutes.';
				statusMessage.className = 'status-message error';
				return;
			}
			newRule.ttlMinutes = ttlMinutes; // Store the TTL duration
			newRule.expiresAt = Date.now() + ttlMinutes * 60 * 1000; // Calculate expiration timestamp
		}

		try {
			const result = await chrome.storage.local.get('domainRules');
			const allRules = result.domainRules || {};

			if (mode === 'off') {
				// If mode is 'off', remove the specific rule for the domain to revert to default behavior
				delete allRules[currentDomain];
			} else {
				allRules[currentDomain] = newRule;
			}

			await chrome.storage.local.set({ domainRules: allRules });
			statusMessage.textContent = 'Rule updated successfully!';
			statusMessage.className = 'status-message success';
			updateCurrentRuleDisplay(newRule.mode === 'off' ? null : newRule); // Update display with new rule or null if 'off'

			// Clear message after a few seconds
			setTimeout(() => {
				statusMessage.textContent = '';
				statusMessage.className = 'status-message';
			}, 3000);

		} catch (error) {
			console.error('Error saving domain rule:', error);
			statusMessage.textContent = 'Error saving rule.';
			statusMessage.className = 'status-message error';
		}
	});

	// Initialize
	const tabInfoLoaded = await getActiveTabInfo();
	if (tabInfoLoaded) {
		await loadDomainRule();
	} else {
		// Controls are already disabled by getActiveTabInfo if it fails
		currentRuleText.textContent = domainDisplay.textContent; // Show the same N/A or error message
	}
});
