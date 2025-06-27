// popup.js

// Global DOM Element References
const domainDisplay = document.getElementById('current-domain');
const ruleModeSelect = document.getElementById('rule-mode');
const ttlSection = document.getElementById('ttl-section');
const ttlValueInput = document.getElementById('ttl-value');
const saveRuleButton = document.getElementById('save-rule-button');
const statusMessage = document.getElementById('status-message');
const currentRuleText = document.getElementById('current-rule-text');
const clearStorageNowButton = document.getElementById('clear-cookies-now-button');

// Global controls
const globalEnableToggle = document.getElementById('global-enable-toggle');
const resetAllRulesButton = document.getElementById('reset-all-rules-button');
const globalStatusMessage = document.getElementById('global-status-message');

// Stored rules summary elements
const storedRulesList = document.getElementById('stored-rules-list');
const noRulesStoredMessage = document.getElementById('no-rules-stored-message');

// Debug log elements
const debugLogEnableCheckbox = document.getElementById('debug-log-enable');
const debugLogControls = document.getElementById('debug-log-controls'); // New
const debugLogListContainer = document.getElementById('debug-log-list-container'); // New (replaces debugLogContainer and debugLogOutput)
const clearDebugLogButton = document.getElementById('clear-debug-log-button'); // New
const toggleTimestampsButton = document.getElementById('toggle-timestamps-button'); // New

// Global State Variables
let debugLogEnabled = false; // This will be loaded from storage
// const MAX_LOG_ENTRIES = 50; // Max entries now handled by background.js
// let logEntries = []; // logEntries are now stored in chrome.storage.local

let showTimestamps = true; // Default to showing timestamps

let currentDomain = '';
let activeTabId = null;
let extensionEnabled = true; // Default to true, will be updated from storage

// --- Global Helper Functions ---

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
	clearStorageNowButton.disabled = disabled; // Also disable this button

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
		updateClearStorageButtonState();
	}
}

// --- Debug Log Helper Functions ---
async function loadDebugLogState() {
	try {
		const result = await chrome.storage.local.get(['debugLogEnabled', 'showTimestamps']);
		debugLogEnabled = result.debugLogEnabled === undefined ? false : result.debugLogEnabled;
		showTimestamps = result.showTimestamps === undefined ? true : result.showTimestamps;
		debugLogEnableCheckbox.checked = debugLogEnabled;
		debugLogControls.style.display = debugLogEnabled ? 'block' : 'none';
		debugLogListContainer.style.display = debugLogEnabled ? 'block' : 'none';
		toggleTimestampsButton.textContent = showTimestamps ? 'Hide Timestamps' : 'Show Timestamps';
		if (debugLogEnabled) {
			await renderDebugLog();
		}
	} catch (error) {
		console.error('Error loading debug log state:', error);
		// Fallback to defaults
		debugLogEnabled = false;
		showTimestamps = true;
		debugLogEnableCheckbox.checked = false;
	}
}

async function renderDebugLog() {
	if (!debugLogEnabled) {
		debugLogListContainer.innerHTML = ''; // Clear if not enabled
		return;
	}
	try {
		const result = await chrome.storage.local.get('debugLog');
		const logs = result.debugLog || [];
		debugLogListContainer.innerHTML = ''; // Clear previous entries

		if (logs.length === 0) {
			const emptyMessage = document.createElement('div');
			emptyMessage.textContent = 'Log is empty.';
			emptyMessage.style.padding = '5px';
			emptyMessage.style.fontStyle = 'italic';
			debugLogListContainer.appendChild(emptyMessage);
			return;
		}

		const ul = document.createElement('ul');
		ul.style.listStyleType = 'none';
		ul.style.padding = '0';
		ul.style.margin = '0';

		logs.forEach(logEntry => { // Logs are stored most recent first
			const li = document.createElement('li');
			li.style.padding = '2px 5px';
			li.style.borderBottom = '1px solid #eee';
			li.style.fontSize = '0.9em';
			li.style.wordBreak = 'break-all';

			let displayMessage = logEntry;
			if (!showTimestamps) {
				// Attempt to strip ISO timestamp and source: [2023-10-27T10:30:00.000Z - Source] Message
				const match = logEntry.match(/^(\\[[^\]]+\\]\\s*)(.*)$/);
				if (match && match[2]) {
					displayMessage = match[2];
				}
			}
			li.textContent = displayMessage;

			if (logEntry.toLowerCase().includes('error')) {
				li.style.color = 'red';
			} else if (logEntry.toLowerCase().includes('warn')) {
				li.style.color = 'orange';
			}
			ul.appendChild(li);
		});
		debugLogListContainer.appendChild(ul);
	} catch (error) {
		console.error('Error rendering debug log:', error);
		debugLogListContainer.textContent = 'Error loading log entries.';
		debugLogListContainer.style.color = 'red';
	}
}

// Replaces the old addDebugLog and updateDebugLogDisplay
async function addDebugLog(message, source = 'Popup') {
	// Always log to console for immediate feedback during development
	const timestamp = new Date().toLocaleTimeString(); // For console only
	console.log(`[${timestamp} - ${source}] ${message}`);

	// Send to background script for persistent storage
	if (typeof chrome.runtime.sendMessage === 'function') {
		chrome.runtime.sendMessage({
			type: 'log-debug-to-storage',
			message: message,
			source: source
		}, (response) => {
			if (chrome.runtime.lastError) {
				console.warn('Error sending debug log to background:', chrome.runtime.lastError.message);
			}
			// The background script will send 'debug-log-updated' to all popups (including this one)
			// which will trigger renderDebugLog if the log is enabled.
		});
	}
}

// --- Current Domain Helper Functions ---
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
	clearStorageNowButton.disabled = true;
	currentRuleText.textContent = message || 'Controls disabled.';
	statusMessage.textContent = '';
}

function updateClearStorageButtonState() {
	if (!extensionEnabled || !currentDomain) {
		clearStorageNowButton.disabled = true;
		return;
	}
	// Enable only if current rule mode is 'blacklist'
	clearStorageNowButton.disabled = ruleModeSelect.value !== 'blacklist';
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
	updateClearStorageButtonState(); // Update button state whenever rule display changes
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
	updateClearStorageButtonState(); // Ensure button state is correct after loading rule
}

// --- Stored Rules Summary Helper Functions ---
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

// --- Initialization Functions ---

async function initDebugLogPanel() {
	await loadDebugLogState(); // Load initial state and render if enabled

	debugLogEnableCheckbox.addEventListener('change', async () => {
		debugLogEnabled = debugLogEnableCheckbox.checked;
		await chrome.storage.local.set({ debugLogEnabled: debugLogEnabled });
		debugLogControls.style.display = debugLogEnabled ? 'block' : 'none';
		debugLogListContainer.style.display = debugLogEnabled ? 'block' : 'none';
		if (debugLogEnabled) {
			addDebugLog('Debug log panel enabled.');
			await renderDebugLog();
		} else {
			addDebugLog('Debug log panel disabled.');
			debugLogListContainer.innerHTML = '';
		}
	});

	clearDebugLogButton.addEventListener('click', async () => {
		if (!confirm('Are you sure you want to clear the entire debug log?')) return;
		try {
			await chrome.storage.local.set({ debugLog: [] });
			addDebugLog('Debug log cleared by user.', 'Popup Action');
			await renderDebugLog();
		} catch (error) {
			console.error('Error clearing debug log:', error);
			addDebugLog(`Error clearing debug log: ${error.message}`, 'Popup Error');
		}
	});

	toggleTimestampsButton.addEventListener('click', async () => {
		showTimestamps = !showTimestamps;
		await chrome.storage.local.set({ showTimestamps: showTimestamps });
		toggleTimestampsButton.textContent = showTimestamps ? 'Hide Timestamps' : 'Show Timestamps';
		addDebugLog(`Timestamps ${showTimestamps ? 'shown' : 'hidden'}.`);
		await renderDebugLog();
	});

	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.type === 'debug-log-updated') {
			if (debugLogEnabled) {
				renderDebugLog();
			}
			return false; // No response needed
		}
		// Handle other messages if any, return true for async response
		return false;
	});
}

async function initGlobalSettingsControls() {
	await loadGlobalSettings(); // Load global settings first

	globalEnableToggle.addEventListener('change', async () => {
		extensionEnabled = globalEnableToggle.checked;
		try {
			await chrome.storage.local.set({ extensionEnabled: extensionEnabled });
			globalStatusMessage.textContent = extensionEnabled ? 'Extension Enabled' : 'Extension Disabled';
			globalStatusMessage.className = extensionEnabled ? 'status-message success' : 'status-message info';
			updatePerDomainControlsState();
			// Notify background to update badge
			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain, forceClear: !extensionEnabled });
			}
			// Refresh other parts of UI that depend on global state
			await loadDomainRule(); // Reload current domain's rule display
			await displayStoredRulesSummary(); // Refresh the summary list

			setTimeout(() => {
				globalStatusMessage.textContent = '';
				globalStatusMessage.className = 'status-message';
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
			const settings = await chrome.storage.local.get('extensionEnabled');
			await chrome.storage.local.remove('domainRules');
			// Re-apply extensionEnabled if it was part of a more complex clear, but here it's fine.
			// await chrome.storage.local.set({ extensionEnabled: settings.extensionEnabled }); // Ensure it's preserved

			globalStatusMessage.textContent = 'All domain rules have been reset.';
			globalStatusMessage.className = 'status-message success';

			await loadDomainRule();
			await displayStoredRulesSummary();

			if (typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain });
			}
			setTimeout(() => {
				globalStatusMessage.textContent = '';
				globalStatusMessage.className = 'status-message';
			}, 3000);
		} catch (error) {
			console.error('Error resetting all rules:', error);
			globalStatusMessage.textContent = 'Error resetting rules.';
			globalStatusMessage.className = 'status-message error';
		}
	});
}

async function initCurrentDomainEditor() {
	const tabInfoLoaded = await getActiveTabInfo();

	if (tabInfoLoaded && extensionEnabled) {
		await loadDomainRule();
	} else if (!extensionEnabled) {
		updatePerDomainControlsState(); // Ensure per-domain controls are correctly disabled/updated
	} else {
		// Controls are already disabled by getActiveTabInfo if it fails and extension is enabled
		// or if domain is unsupported.
		// currentRuleText.textContent might be set by disableControls called from getActiveTabInfo
		// If domainDisplay has a message like 'N/A (Unsupported Page)', reflect it.
		if (domainDisplay.textContent && domainDisplay.textContent !== currentDomain) {
			currentRuleText.textContent = domainDisplay.textContent;
		}
	}

	ruleModeSelect.addEventListener('change', () => {
		if (ruleModeSelect.value === 'allow') {
			ttlSection.style.display = 'block';
			ttlValueInput.disabled = !extensionEnabled ? true : false;
		} else {
			ttlSection.style.display = 'none';
			ttlValueInput.disabled = true;
		}
		// Update button state based on current selection, not just saved rule
		// This makes UI more responsive to user trying out 'blacklist'
		if (extensionEnabled && currentDomain) {
			clearStorageNowButton.disabled = ruleModeSelect.value !== 'blacklist';
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
			newRule.ttlMinutes = ttlMinutes;
			newRule.expiresAt = Date.now() + ttlMinutes * 60 * 1000;
			addDebugLog(`Calculated TTL for 'allow' mode: ${ttlMinutes} mins, expires at ${new Date(newRule.expiresAt).toISOString()}`);
		}

		try {
			const result = await chrome.storage.local.get('domainRules');
			const allRules = result.domainRules || {};

			if (mode === 'off') {
				delete allRules[currentDomain];
				addDebugLog(`Rule for ${currentDomain} set to 'off'. Removing from storage.`);
			} else {
				allRules[currentDomain] = newRule;
				addDebugLog(`Saving rule for ${currentDomain}: ${JSON.stringify(newRule)}`);
			}

			await chrome.storage.local.set({ domainRules: allRules });
			statusMessage.textContent = 'Rule updated successfully!';
			statusMessage.className = 'status-message success';
			updateCurrentRuleDisplay(newRule.mode === 'off' ? null : newRule);
			await displayStoredRulesSummary();

			if (activeTabId && currentDomain && typeof chrome.runtime.sendMessage === 'function') {
				chrome.runtime.sendMessage({ action: "refreshBadgeForDomain", domain: currentDomain });
			}

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
		updateClearStorageButtonState(); // Reflects saved rule
	});

	clearStorageNowButton.addEventListener('click', async () => {
		// Check against the *currently selected* mode in the UI, not just the saved one.
		// This allows clearing if user selects 'blacklist' even before saving.
		if (!extensionEnabled || !currentDomain || ruleModeSelect.value !== 'blacklist') {
			statusMessage.textContent = 'Can only clear storage if domain is blacklisted (select Blacklist mode).';
			statusMessage.className = 'status-message error';
			addDebugLog('Manual storage clear attempted but conditions not met (domain not blacklisted in UI).', 'Warn');
			setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = 'status-message'; }, 3000);
			return;
		}

		addDebugLog(`Manual storage clear requested for ${currentDomain}.`);
		statusMessage.textContent = `Clearing all storage for ${currentDomain}...`;
		statusMessage.className = 'status-message info';

		try {
			const response = await chrome.runtime.sendMessage({
				action: "manualClearCookies",
				domain: currentDomain
			});
			if (response && response.status === 'success') {
				statusMessage.textContent = `All storage for ${currentDomain} cleared successfully.`;
				statusMessage.className = 'status-message success';
				addDebugLog(`Manual storage clear successful for ${currentDomain}.`);
			} else {
				statusMessage.textContent = `Failed to clear storage: ${response ? response.message : 'No response'}`;
				statusMessage.className = 'status-message error';
				addDebugLog(`Manual storage clear failed for ${currentDomain}: ${response ? response.message : 'No response'}`, 'Error');
			}
		} catch (error) {
			console.error('Error sending manual clear message:', error);
			statusMessage.textContent = 'Error sending request to clear storage.';
			statusMessage.className = 'status-message error';
			addDebugLog(`Error sending manual clear message: ${error.message}`, 'Error');
		}

		setTimeout(() => {
			statusMessage.textContent = '';
			statusMessage.className = 'status-message';
		}, 5000);
	});
}

async function initStoredRulesSummary() {
	await displayStoredRulesSummary(); // Display summary on initial load
}

/**
 * Toggles the visibility of the debug log panel.
 * Updates ARIA attributes for accessibility.
 */
function toggleDebugPanel() {
	const debugLogContainer = document.getElementById('debugLogContainer');
	const toggleButton = document.getElementById('toggleDebug');
	if (debugLogContainer) {
		const isHidden = debugLogContainer.hidden;
		debugLogContainer.hidden = !isHidden;
		debugLogContainer.setAttribute('aria-hidden', String(!isHidden));
		toggleButton.setAttribute('aria-expanded', String(isHidden));
		toggleButton.textContent = isHidden ? 'Hide Debug Log' : 'Show Debug Log';
		if (isHidden) {
			loadDebugLog(); // Load log content when shown
		}
	}
}

/**
 * Initializes the popup by loading rules, setting up event listeners,
 * and restoring settings.
 */
function initPopup() {
	// Remove the tab-related code since we simplified the UI
	// Focus on the core functionality that already exists
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
	// Initial log message
	// This addDebugLog call is intentionally kept here to log popup opening
	// before debug panel itself is fully initialized, ensuring the message is captured.
	if (typeof addDebugLog === 'function') { // Check if addDebugLog is defined
		addDebugLog('Popup opened. Initializing...');
	} else {
		// Fallback console log if addDebugLog isn't ready (should not happen with current structure)
		console.log('[AutoClear Popup] Popup opened. Initializing... (addDebugLog not yet available)');
	}

	// Initialize global settings first as other modules might depend on extensionEnabled
	await initGlobalSettingsControls();

	// Initialize debug log panel (includes loading its state and setting up its listener)
	await initDebugLogPanel();

	// Initialize current domain editor, which might log and depends on global state
	// This will also load the current domain's rule.
	await initCurrentDomainEditor();

	// Initialize stored rules summary, which also depends on global state
	await initStoredRulesSummary();
});
