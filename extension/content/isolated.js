/**
 * isolated.js
 * Runs in the isolated ISOLATED world.
 * - Extracts storage (localStorage, sessionStorage, IndexedDB)
 * - Listens for incoming POST messages from main_world.js 
 * - Communicates with background.js
 */

// Format bytes to human-readable string
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function analyzeStorage() {
  const result = {
    localStorage: { items: [], totalSize: 0, error: null },
    sessionStorage: { items: [], totalSize: 0, error: null },
    indexedDB: { databases: [], count: 0, available: false, error: null },
  };

  function guessValueType(value) {
    if (!value) return 'empty';
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return 'json-array';
      if (typeof parsed === 'object') return 'json-object';
      if (typeof parsed === 'number') return 'number';
      if (typeof parsed === 'boolean') return 'boolean';
    } catch (e) {
      // Not JSON
    }
    if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return 'uuid';
    if (value.match(/^\d{13}$/)) return 'timestamp';
    if (value.match(/^eyJ/)) return 'jwt-token';
    if (value.match(/^https?:\/\//)) return 'url';
    if (value.length > 100) return 'long-string';
    return 'string';
  }

  // === localStorage ===
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      const size = (key.length + (value ? value.length : 0)) * 2;
      result.localStorage.items.push({
        key,
        value: value && value.length > 200 ? value.substring(0, 200) + '…' : value,
        fullLength: value ? value.length : 0,
        size,
        type: guessValueType(value),
      });
      result.localStorage.totalSize += size;
    }
  } catch (e) {
    result.localStorage.error = e.message;
  }

  // === sessionStorage ===
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      const size = (key.length + (value ? value.length : 0)) * 2;
      result.sessionStorage.items.push({
        key,
        value: value && value.length > 200 ? value.substring(0, 200) + '…' : value,
        fullLength: value ? value.length : 0,
        size,
        type: guessValueType(value),
      });
      result.sessionStorage.totalSize += size;
    }
  } catch (e) {
    result.sessionStorage.error = e.message;
  }

  // === IndexedDB ===
  try {
    result.indexedDB.available = !!(window.indexedDB && indexedDB.databases);
    if (result.indexedDB.available) {
        const dbs = await indexedDB.databases();
        result.indexedDB.databases = dbs.map(db => ({ name: db.name, version: db.version }));
        result.indexedDB.count = dbs.length;
    }
  } catch (e) {
    result.indexedDB.error = e.message;
  }

  // Final compilation
  return {
    localStorage: {
      itemCount: result.localStorage.items.length,
      totalSize: result.localStorage.totalSize,
      totalSizeFormatted: formatBytes(result.localStorage.totalSize),
      items: result.localStorage.items,
      error: result.localStorage.error,
    },
    sessionStorage: {
      itemCount: result.sessionStorage.items.length,
      totalSize: result.sessionStorage.totalSize,
      totalSizeFormatted: formatBytes(result.sessionStorage.totalSize),
      items: result.sessionStorage.items,
      error: result.sessionStorage.error,
    },
    indexedDB: {
      databaseCount: result.indexedDB.count,
      databases: result.indexedDB.databases,
      available: result.indexedDB.available,
    },
    totalStorageSize: result.localStorage.totalSize + result.sessionStorage.totalSize,
    totalStorageSizeFormatted: formatBytes(result.localStorage.totalSize + result.sessionStorage.totalSize),
  };
}


let latestMainWorldLogs = {
  fingerprint: [],
  permission: [],
  extension: [],
  profiling: []
};

// Listen for updates from the main world
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data && (event.data.type === 'DataAnalyzer_Logs_Response' || event.data.type === 'DataAnalyzer_Logs_Update')) {
    latestMainWorldLogs = {
      fingerprint: event.data.fingerprint || [],
      permission: event.data.permission || [],
      extension: event.data.extension || [],
      profiling: event.data.profiling || []
    };
  }
});

// Request initial logs
window.dispatchEvent(new Event('DataAnalyzer_RequestLogs'));

// Listen for commands from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_ANALYSIS_DATA') {
    // Force an immediate request to get latest data
    window.dispatchEvent(new Event('DataAnalyzer_RequestLogs'));
    
    // Give the main world script 50ms to respond, then resolve
    setTimeout(async () => {
      const storageData = await analyzeStorage();
      sendResponse({
        success: true,
        storage: storageData,
        mainWorldLogs: latestMainWorldLogs
      });
    }, 50);

    return true; // Keep message channel open for async response
  }
});
