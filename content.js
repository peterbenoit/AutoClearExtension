// content.js
try {
	// Clear localStorage
	localStorage.clear();

	// Clear sessionStorage
	sessionStorage.clear();

	// Delete all IndexedDB databases
	if (indexedDB && indexedDB.databases) {
		indexedDB.databases().then(databases => {
			databases.forEach(db => {
				indexedDB.deleteDatabase(db.name);
			});
		}).catch(error => {
			console.error('Error listing IndexedDB databases:', error);
		});
	} else if (indexedDB) {
		// Fallback for browsers that do not support indexedDB.databases()
		// This is a more complex scenario as there's no standard way to list all DBs without knowing their names.
		// For this minimal implementation, we'll log a message if specific DB names aren't known.
		// In a real-world scenario, a predefined list of common DB names or a configuration option might be used.
		console.warn('indexedDB.databases() is not supported. Specific database names are required to delete them.');
	}

} catch (error) {
	console.error('Error clearing storage:', error);
}
