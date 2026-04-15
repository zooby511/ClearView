/**
 * storageAnalyzer.js
 * Collects data from localStorage, sessionStorage, and IndexedDB.
 * Measures storage footprint and identifies stored data types.
 */

/**
 * Analyze all web storage after page navigation
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<Object>} Storage analysis results
 */
async function analyzeStorage(page) {
  const storageData = await page.evaluate(() => {
    const result = {
      localStorage: { items: [], totalSize: 0 },
      sessionStorage: { items: [], totalSize: 0 },
      indexedDB: { databases: [] },
    };

    // === localStorage ===
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        const size = (key.length + (value ? value.length : 0)) * 2; // UTF-16 = 2 bytes per char
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
      if (window.indexedDB && indexedDB.databases) {
        // Note: databases() is async but we handle it separately
        result.indexedDB.available = true;
      } else {
        result.indexedDB.available = false;
      }
    } catch (e) {
      result.indexedDB.error = e.message;
    }

    function guessValueType(value) {
      if (!value) return 'empty';
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return 'json-array';
        if (typeof parsed === 'object') return 'json-object';
        if (typeof parsed === 'number') return 'number';
        if (typeof parsed === 'boolean') return 'boolean';
      } catch {
        // Not JSON
      }
      if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return 'uuid';
      if (value.match(/^\d{13}$/)) return 'timestamp';
      if (value.match(/^eyJ/)) return 'jwt-token';
      if (value.match(/^https?:\/\//)) return 'url';
      if (value.length > 100) return 'long-string';
      return 'string';
    }

    return result;
  });

  // Try to get IndexedDB database names (requires async evaluation)
  try {
    const idbDatabases = await page.evaluate(async () => {
      try {
        if (window.indexedDB && indexedDB.databases) {
          const dbs = await indexedDB.databases();
          return dbs.map((db) => ({
            name: db.name,
            version: db.version,
          }));
        }
        return [];
      } catch {
        return [];
      }
    });
    storageData.indexedDB.databases = idbDatabases;
    storageData.indexedDB.count = idbDatabases.length;
  } catch {
    storageData.indexedDB.databases = [];
    storageData.indexedDB.count = 0;
  }

  // Build summary
  return {
    localStorage: {
      itemCount: storageData.localStorage.items.length,
      totalSize: storageData.localStorage.totalSize,
      totalSizeFormatted: formatBytes(storageData.localStorage.totalSize),
      items: storageData.localStorage.items,
      error: storageData.localStorage.error || null,
    },
    sessionStorage: {
      itemCount: storageData.sessionStorage.items.length,
      totalSize: storageData.sessionStorage.totalSize,
      totalSizeFormatted: formatBytes(storageData.sessionStorage.totalSize),
      items: storageData.sessionStorage.items,
      error: storageData.sessionStorage.error || null,
    },
    indexedDB: {
      databaseCount: storageData.indexedDB.count || 0,
      databases: storageData.indexedDB.databases || [],
      available: storageData.indexedDB.available || false,
    },
    totalStorageSize: storageData.localStorage.totalSize + storageData.sessionStorage.totalSize,
    totalStorageSizeFormatted: formatBytes(
      storageData.localStorage.totalSize + storageData.sessionStorage.totalSize
    ),
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { analyzeStorage };
