// popup.js

document.addEventListener('DOMContentLoaded', async () => {
	const domainDisplay = document.getElementById('current-domain');
	const ruleModeSelect = document.getElementById('rule-mode');
	const ttlSection = document.getElementById('ttl-section');
	const ttlValueInput = document.getElementById('ttl-value');
	const saveRuleButton = document.getElementById('save-rule-button');
	const statusMessage = document.getElementById('status-message');
	const currentRuleText = document.getElementById('current-rule-text');
	const clearCookiesNowButton = document.getElementById('clear-cookies-now-button');

	// Global controls
	const globalEnableToggle = document.getElementById('global-enable-toggle');
	const resetAllRulesButton = document.getElementById('reset-all-rules-button');
	const globalStatusMessage = document.getElementById('global-status-message');

	// Stored rules summary elements
	const storedRulesList = document.getElementById('stored-rules-list');
	const noRulesStoredMessage = document.getElementById('no-rules-stored-message');

	// Debug log elements
	const debugLogEnableCheckbox = document.getElementById('debug-log-enable');
	const debugLogContainer = document.getElementById('debug-log-container');
	const debugLogOutput = document.getElementById('debug-log-output');
	let debugLogEnabled = false;
	const MAX_LOG_ENTRIES = 50;
	let logEntries = [];

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
		clearCookiesNowButton.disabled = disabled; // Also disable this button

		if (disabled) {
			currentRuleText.textContent = 'Extension is globally disabled.';
			domainDisplay.textContent = currentDomain || 'N/A'; // Keep domain if loaded
		} else {
			// If enabling, re-load domain rule to refresh display
			if (currentDomain) {
				loadDomainRule();
			} else {
				currentRuleText.textContent = 'Load a page to see its rule.';
			}
		}
		// Update clear cookies button based on current rule, if not globally disabled
		if (!disabled && currentDomain) {
			updateClearCookiesButtonState();
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
			setTimeout(() => {
				globalStatusMessage.textContent = '';
				globalStatusMessage.className = 'status-message'; // Reset class
			}, 3000);
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
			setTimeout(() => {
				globalStatusMessage.textContent = '';
				globalStatusMessage.className = 'status-message'; // Reset class
			}, 3000);
		} catch (error) {
			console.error('Error resetting all rules:', error);
			globalStatusMessage.textContent = 'Error resetting rules.';
			globalStatusMessage.className = 'status-message error';
		}
	});

	// --- Debug Log Functionality ---
	function updateDebugLogDisplay() {
		debugLogOutput.textContent = logEntries.join('\n');
	}

	function addDebugLog(message, source = 'Popup') {
		const timestamp = new Date().toLocaleTimeString();
		const logMessage = `[${timestamp} - ${source}] ${message}`;
		console.log(logMessage); // Always log to console

		if (debugLogEnabled) {
			logEntries.unshift(logMessage); // Add to the beginning
			if (logEntries.length > MAX_LOG_ENTRIES) {
				logEntries.pop(); // Remove the oldest entry
			}
			updateDebugLogDisplay();
		}
	}

	debugLogEnableCheckbox.addEventListener('change', () => {
		debugLogEnabled = debugLogEnableCheckbox.checked;
		debugLogContainer.style.display = debugLogEnabled ? 'block' : 'none';
		if (debugLogEnabled) {
			addDebugLog('Debug log enabled.');
			updateDebugLogDisplay(); // Show existing logs if any were captured while hidden but enabled
		} else {
			addDebugLog('Debug log disabled.'); // Log this to console
		}
	});

	// Listen for debug messages from other parts of the extension
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.type === 'debug-log') {
			let source = 'Unknown';
			if (sender.tab) {
				source = `Content Script (${new URL(sender.tab.url).hostname})`;
			} else if (sender.id === chrome.runtime.id) {
				// Heuristic: if sender.id is our own extension id, it's likely from background
				// Note: sender.url might be undefined for background script messages.
				source = 'Background';
			}
			addDebugLog(request.message, source);
			// No sendResponse needed for debug logs unless we want to confirm receipt
		}
		// Keep this listener specific or ensure it doesn't interfere with other listeners
		// by not returning true unless it's handling the message exclusively and asynchronously.
		// For debug logs, we typically don't need to send a response.
	});
	// --- End Debug Log Functionality ---

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
					addDebugLog(`Active tab: ${currentDomain} (ID: ${activeTabId})`);
				} else {
					domainDisplay.textContent = 'N/A (Unsupported Page)';
					addDebugLog(`Active tab: Unsupported page (${tab.url})`);
					disableControls('Unsupported page protocol.');
					return false;
				}
			} else {
				domainDisplay.textContent = 'N/A';
				disableControls('Unable to determine current page.');
				return false;
			}
			return true;
		} catch (error) {
			console.error('Error getting active tab:', error);
			addDebugLog(`Error getting active tab: ${error.message}`, 'Error');
			domainDisplay.textContent = 'Error';
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
		clearCookiesNowButton.disabled = true;
		currentRuleText.textContent = message || 'Controls disabled.';
		statusMessage.textContent = '';
	}

	function updateClearCookiesButtonState() {
		if (!extensionEnabled || !currentDomain) {
			clearCookiesNowButton.disabled = true;
			return;
		}
		// Enable only if current rule mode is 'blacklist'
		clearCookiesNowButton.disabled = ruleModeSelect.value !== 'blacklist';
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
			if (typeof rule.expiresAt === 'number') {
				const remainingMinutes = Math.max(0, Math.round((rule.expiresAt - Date.now()) / 60000));
				currentRuleText.textContent = `Rule: Temporarily Allowed. Expires in ~${remainingMinutes} min.`;
			} else {
				currentRuleText.textContent = `Rule: Temporarily Allowed (TTL not set correctly).`;
			}
		} else {
			currentRuleText.textContent = `Unknown rule state.`;
		}
		updateClearCookiesButtonState(); // Update button state whenever rule display changes
	}

	async function loadDomainRule() {
		if (!extensionEnabled) {
			addDebugLog('loadDomainRule: Extension globally disabled.');
			updatePerDomainControlsState();
			return;
		}

		if (!currentDomain) {
			addDebugLog('loadDomainRule: No current domain.');
			updateCurrentRuleDisplay(null);
			disableControls("No domain to load rule for.");
			return;
		}
		addDebugLog(`loadDomainRule: Loading rule for ${currentDomain}`);

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
				addDebugLog(`No rule found for ${currentDomain}. Set UI to default.`);
			}
			updateCurrentRuleDisplay(domainRule);
			addDebugLog(`Rule for ${currentDomain}: ${JSON.stringify(domainRule || 'off')}`);
			// Enable controls after loading, only if extension is enabled
			if (extensionEnabled) {
				ruleModeSelect.disabled = false;
				ttlValueInput.disabled = ruleModeSelect.value !== 'allow';
				saveRuleButton.disabled = false;
				// updateClearCookiesButtonState(); // Called by updateCurrentRuleDisplay
			} else {
				updatePerDomainControlsState(); // Ensure they are disabled if extension is off
			}

		} catch (error) {
			console.error('Error loading domain rule:', error);
			statusMessage.textContent = 'Error loading rule.';
			statusMessage.className = 'status-message error';
			disableControls('Error loading rule.');
			updateCurrentRuleDisplay(null);
			addDebugLog(`Error loading domain rule for ${currentDomain}: ${error.message}`, 'Error');
		}
		updateClearCookiesButtonState(); // Ensure button state is correct after loading rule
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
		// No direct impact on clearCookiesNowButton from mode select, it depends on the *saved* rule.
		// However, if we want it to reflect the *selected* mode before saving, we could call updateClearCookiesButtonState here.
		// For now, it reflects the saved/loaded rule.
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
			addDebugLog(`Calculated TTL for 'allow' mode: ${ttlMinutes} mins, expires at ${new Date(newRule.expiresAt).toISOString()}`);
		}

		try {
			const result = await chrome.storage.local.get('domainRules');
			const allRules = result.domainRules || {};

			if (mode === 'off') {
				// If mode is 'off', remove the specific rule for the domain to revert to default behavior
				delete allRules[currentDomain];
				addDebugLog(`Rule for ${currentDomain} set to 'off'. Removing from storage.`);
			} else {
				allRules[currentDomain] = newRule;
				addDebugLog(`Saving rule for ${currentDomain}: ${JSON.stringify(newRule)}`);
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
			addDebugLog(`Error saving rule for ${currentDomain}: ${error.message}`, 'Error');
		}
		updateClearCookiesButtonState(); // Update button state after saving a rule
	});

	clearCookiesNowButton.addEventListener('click', async () => {
		if (!extensionEnabled || !currentDomain || ruleModeSelect.value !== 'blacklist') {
			statusMessage.textContent = 'Can only clear cookies if domain is blacklisted.';
			statusMessage.className = 'status-message error';
			addDebugLog('Manual cookie clear attempted but conditions not met.', 'Warn');
			setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = 'status-message'; }, 3000);
			return;
		}

		addDebugLog(`Manual cookie clear requested for ${currentDomain}.`);
		statusMessage.textContent = `Clearing cookies for ${currentDomain}...`;
		statusMessage.className = 'status-message info';

		try {
			const response = await chrome.runtime.sendMessage({ action: "manualClearCookies", domain: currentDomain });
			if (response && response.status === 'success') {
				statusMessage.textContent = `Cookies for ${currentDomain} cleared successfully.`;
				statusMessage.className = 'status-message success';
				addDebugLog(`Manual cookie clear successful for ${currentDomain}.`);
			} else {
				statusMessage.textContent = `Failed to clear cookies: ${response ? response.message : 'No response'}`;
				statusMessage.className = 'status-message error';
				addDebugLog(`Manual cookie clear failed for ${currentDomain}: ${response ? response.message : 'No response'}`, 'Error');
			}
		} catch (error) {
			console.error('Error sending manualClearCookies message:', error);
			statusMessage.textContent = 'Error sending request to clear cookies.';
			statusMessage.className = 'status-message error';
			addDebugLog(`Error sending manualClearCookies message: ${error.message}`, 'Error');
		}

		setTimeout(() => {
			statusMessage.textContent = '';
			statusMessage.className = 'status-message';
		}, 5000); // Longer timeout for this message
	});


	// Initialize
	addDebugLog('Popup opened. Initializing...');
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
