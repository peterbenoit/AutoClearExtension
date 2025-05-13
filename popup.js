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

	// Global controls
	const globalEnableToggle = document.getElementById('global-enable-toggle');
	const resetAllRulesButton = document.getElementById('reset-all-rules-button');
	const globalStatusMessage = document.getElementById('global-status-message');

	// Stored rules summary elements
	const storedRulesList = document.getElementById('stored-rules-list');
	const noRulesStoredMessage = document.getElementById('no-rules-stored-message');

	let currentDomain = '';
	let activeTabId = null;
	let extensionEnabled = true; // Default to true, will be updated from storage

	async function loadGlobalSettings() {
		try {
			const result = await chrome.storage.local.get('extensionEnabled');
			extensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
			globalEnableToggle.checked = extensionEnabled;
			updatePerDomainControlsState(); // Enable/disable per-domain controls based on global state
		} catch (error) {
			console.error('Error loading global settings:', error);
			globalStatusMessage.textContent = 'Error loading global state.';
			globalStatusMessage.className = 'status-message error';
			// Assume enabled on error to be safe, or handle as critical failure
			extensionEnabled = true;
			globalEnableToggle.checked = true;
		}
	}

	function updatePerDomainControlsState() {
		const disabled = !extensionEnabled;
		ruleModeSelect.disabled = disabled;
		ttlValueInput.disabled = disabled || ruleModeSelect.value !== 'allow';
		saveRuleButton.disabled = disabled;
		if (disabled) {
			currentRuleText.textContent = 'Extension is globally disabled.';
			domainDisplay.textContent = currentDomain || 'N/A'; // Keep domain if loaded
			ruleDomainDisplay.textContent = currentDomain || 'this domain';
		} else {
			// If enabling, re-load domain rule to refresh display
			if (currentDomain) {
				loadDomainRule();
			} else {
				currentRuleText.textContent = 'Load a page to see its rule.';
			}
		}
	}

	globalEnableToggle.addEventListener('change', async () => {
		extensionEnabled = globalEnableToggle.checked;
		try {
			await chrome.storage.local.set({ extensionEnabled: extensionEnabled });
			globalStatusMessage.textContent = extensionEnabled ? 'Extension Enabled' : 'Extension Disabled';
			globalStatusMessage.className = extensionEnabled ? 'status-message success' : 'status-message info';
			updatePerDomainControlsState();
			// Notify background to update badge (it will clear if disabled)
			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain, forceClear: !extensionEnabled });
			}
			setTimeout(() => { globalStatusMessage.textContent = ''; }, 3000);
		} catch (error) {
			console.error('Error saving global enabled state:', error);
			globalStatusMessage.textContent = 'Error saving global state.';
			globalStatusMessage.className = 'status-message error';
		}
	});

	resetAllRulesButton.addEventListener('click', async () => {
		if (!confirm('Are you sure you want to reset all domain-specific rules? This cannot be undone.')) {
			return;
		}
		try {
			// Preserve the extensionEnabled flag, clear only domainRules
			const settings = await chrome.storage.local.get('extensionEnabled');
			// Instead of chrome.storage.local.clear(), explicitly remove domainRules
			await chrome.storage.local.remove('domainRules');
			// No need to set extensionEnabled again if it was preserved by not clearing all.
			// If domainRules was the only other thing, this is fine.
			// If there were other top-level keys, they would remain.
			// For this extension, we only have domainRules and extensionEnabled at the top level.

			globalStatusMessage.textContent = 'All domain rules have been reset.';
			globalStatusMessage.className = 'status-message success';

			await loadDomainRule(); // Reload current domain's rule display
			await displayStoredRulesSummary(); // Refresh the summary list

			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain });
			}
			setTimeout(() => { globalStatusMessage.textContent = ''; }, 3000);
		} catch (error) {
			console.error('Error resetting all rules:', error);
			globalStatusMessage.textContent = 'Error resetting rules.';
			globalStatusMessage.className = 'status-message error';
		}
	});

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
		// This function is now primarily for non-global disabling (e.g. unsupported page)
		// Global disable is handled by updatePerDomainControlsState
		ruleModeSelect.disabled = true;
		ttlValueInput.disabled = true;
		saveRuleButton.disabled = true;
		currentRuleText.textContent = message || 'Controls disabled.';
		statusMessage.textContent = '';
	}

	function updateCurrentRuleDisplay(rule) {
		if (!extensionEnabled) {
			currentRuleText.textContent = 'Extension is globally disabled.';
			return;
		}
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
		if (!extensionEnabled) {
			updatePerDomainControlsState();
			return;
		}

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
			// Enable controls after loading, only if extension is enabled
			if (extensionEnabled) {
				ruleModeSelect.disabled = false;
				ttlValueInput.disabled = ruleModeSelect.value !== 'allow';
				saveRuleButton.disabled = false;
			} else {
				updatePerDomainControlsState(); // Ensure they are disabled if extension is off
			}

		} catch (error) {
			console.error('Error loading domain rule:', error);
			statusMessage.textContent = 'Error loading rule.';
			statusMessage.className = 'status-message error';
			disableControls('Error loading rule.');
			updateCurrentRuleDisplay(null);
		}
	}

	async function displayStoredRulesSummary() {
		if (!extensionEnabled) {
			storedRulesList.innerHTML = ''; // Clear previous list
			noRulesStoredMessage.textContent = 'Extension is globally disabled. Rule summary not available.';
			noRulesStoredMessage.style.display = 'block';
			return;
		}
		try {
			const result = await chrome.storage.local.get('domainRules');
			const allRules = result.domainRules || {};

			storedRulesList.innerHTML = ''; // Clear previous list

			const domains = Object.keys(allRules);
			if (domains.length === 0) {
				noRulesStoredMessage.textContent = 'No specific domain rules are currently stored.';
				noRulesStoredMessage.style.display = 'block';
				return;
			}

			noRulesStoredMessage.style.display = 'none';

			domains.sort().forEach(domain => {
				const rule = allRules[domain];
				const listItem = document.createElement('li');
				let ruleDetails = `<strong>${domain}:</strong> ${rule.mode}`;

				if (rule.mode === 'allow' && rule.expiresAt) {
					const now = Date.now();
					const remainingMs = rule.expiresAt - now;
					if (remainingMs <= 0) {
						ruleDetails += ' (expired)';
					} else {
						const remainingMinutes = Math.round(remainingMs / 60000);
						ruleDetails += ` (~${remainingMinutes} min left)`;
					}
				} else if (rule.mode === 'allow' && rule.ttlMinutes) {
					ruleDetails += ` (TTL: ${rule.ttlMinutes} min - not yet activated/visited)`;
				}

				listItem.innerHTML = ruleDetails;
				storedRulesList.appendChild(listItem);
			});
		} catch (error) {
			console.error('Error displaying stored rules summary:', error);
			storedRulesList.innerHTML = '';
			noRulesStoredMessage.textContent = 'Error loading stored rules summary.';
			noRulesStoredMessage.className = 'status-message error'; // Reuse class if appropriate
			noRulesStoredMessage.style.display = 'block';
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
		if (!extensionEnabled) {
			statusMessage.textContent = 'Extension is globally disabled. Cannot save rule.';
			statusMessage.className = 'status-message error';
			return;
		}

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
			await displayStoredRulesSummary(); // Refresh the summary list

			// Notify background to update badge for this tab's domain
			if (activeTabId && currentDomain && typeof chrome.runtime.sendMessage === 'function') {
				// console.log(`[AutoClear Popup] Requesting badge refresh for domain: ${currentDomain} on tab ${activeTabId}`);
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain }, (response) => {
					if (chrome.runtime.lastError) {
						// console.warn('[AutoClear Popup] Error sending refreshBadgeForDomain message:', chrome.runtime.lastError.message);
					} else {
						// console.log('[AutoClear Popup] Badge refresh message response:', response);
					}
				});
			}

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
	await loadGlobalSettings(); // Load global settings first
	const tabInfoLoaded = await getActiveTabInfo();
	if (tabInfoLoaded && extensionEnabled) { // Only load domain rule if extension enabled and tab info loaded
		await loadDomainRule();
	} else if (!extensionEnabled) {
		updatePerDomainControlsState(); // Ensure per-domain controls are correctly disabled
	} else {
		// Controls are already disabled by getActiveTabInfo if it fails and extension is enabled
		currentRuleText.textContent = domainDisplay.textContent; // Show the same N/A or error message
	}
	await displayStoredRulesSummary(); // Display summary on initial load
});
