/**
 * permissionAnalyzer.js
 * Detects when websites request browser permissions like
 * geolocation, camera, microphone, notifications, clipboard, etc.
 */

/**
 * Returns JavaScript code to inject before page load.
 * Monitors permission API calls and direct permission requests.
 */
function getPermissionInjectionScript() {
  return `
    (function() {
      window.__permissionLog = [];
      const log = window.__permissionLog;

      function addLog(type, api, detail) {
        log.push({
          type: type,
          api: api,
          detail: detail || '',
          timestamp: Date.now()
        });
      }

      // ==============================
      // 1. PERMISSIONS API (query)
      // ==============================
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const origQuery = navigator.permissions.query.bind(navigator.permissions);
          navigator.permissions.query = function(permDesc) {
            addLog(permDesc.name || 'unknown', 'permissions.query', JSON.stringify(permDesc));
            return origQuery(permDesc);
          };
        }
      } catch(e) {}

      // ==============================
      // 2. GEOLOCATION
      // ==============================
      try {
        if (navigator.geolocation) {
          const origGetPos = navigator.geolocation.getCurrentPosition;
          navigator.geolocation.getCurrentPosition = function(success, error, options) {
            addLog('geolocation', 'getCurrentPosition', JSON.stringify(options || {}));
            return origGetPos.call(navigator.geolocation, success, error, options);
          };

          const origWatchPos = navigator.geolocation.watchPosition;
          navigator.geolocation.watchPosition = function(success, error, options) {
            addLog('geolocation', 'watchPosition', 'Continuous tracking requested');
            return origWatchPos.call(navigator.geolocation, success, error, options);
          };
        }
      } catch(e) {}

      // ==============================
      // 3. CAMERA / MICROPHONE
      // ==============================
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = function(constraints) {
            const types = [];
            if (constraints?.audio) types.push('audio/microphone');
            if (constraints?.video) types.push('video/camera');
            addLog(types.join(', ') || 'media', 'getUserMedia', JSON.stringify(constraints));
            return origGetUserMedia(constraints);
          };
        }
      } catch(e) {}

      // ==============================
      // 4. NOTIFICATIONS
      // ==============================
      try {
        const OrigNotification = window.Notification;
        if (OrigNotification && OrigNotification.requestPermission) {
          const origRequestPermission = OrigNotification.requestPermission.bind(OrigNotification);
          Notification.requestPermission = function(callback) {
            addLog('notifications', 'Notification.requestPermission', '');
            return origRequestPermission(callback);
          };
        }
      } catch(e) {}

      // ==============================
      // 5. CLIPBOARD
      // ==============================
      try {
        if (navigator.clipboard) {
          const origRead = navigator.clipboard.readText?.bind(navigator.clipboard);
          if (origRead) {
            navigator.clipboard.readText = function() {
              addLog('clipboard-read', 'clipboard.readText', 'Reading clipboard');
              return origRead();
            };
          }

          const origWrite = navigator.clipboard.writeText?.bind(navigator.clipboard);
          if (origWrite) {
            navigator.clipboard.writeText = function(text) {
              addLog('clipboard-write', 'clipboard.writeText', 'Writing to clipboard');
              return origWrite(text);
            };
          }
        }
      } catch(e) {}

      // ==============================
      // 6. FULLSCREEN
      // ==============================
      try {
        const origRequestFullscreen = Element.prototype.requestFullscreen;
        if (origRequestFullscreen) {
          Element.prototype.requestFullscreen = function(options) {
            addLog('fullscreen', 'requestFullscreen', this.tagName);
            return origRequestFullscreen.call(this, options);
          };
        }
      } catch(e) {}

      // ==============================
      // 7. WAKE LOCK
      // ==============================
      try {
        if (navigator.wakeLock) {
          const origRequest = navigator.wakeLock.request.bind(navigator.wakeLock);
          navigator.wakeLock.request = function(type) {
            addLog('wake-lock', 'wakeLock.request', type || 'screen');
            return origRequest(type);
          };
        }
      } catch(e) {}

      // ==============================
      // 8. SERVICE WORKERS
      // ==============================
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.register) {
          const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = function(scriptURL, options) {
            addLog('service-worker', 'serviceWorker.register', scriptURL);
            return origRegister(scriptURL, options);
          };
        }
      } catch(e) {}

      // ==============================
      // 9. WEB WORKERS
      // ==============================
      try {
        const OrigWorker = window.Worker;
        if (OrigWorker) {
          window.Worker = function(scriptURL, options) {
            addLog('web-worker', 'new Worker()', scriptURL);
            return new OrigWorker(scriptURL, options);
          };
          window.Worker.prototype = OrigWorker.prototype;
        }
      } catch(e) {}

    })();
  `;
}

/**
 * Collect the permission log from the page
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} Permission analysis results
 */
async function collectPermissionResults(page) {
  const rawLog = await page.evaluate(() => {
    return window.__permissionLog || [];
  });

  // Group by type
  const permissionMap = {};
  rawLog.forEach((entry) => {
    if (!permissionMap[entry.type]) {
      permissionMap[entry.type] = {
        type: entry.type,
        calls: [],
        count: 0,
        icon: getPermissionIcon(entry.type),
        riskLevel: getPermissionRiskLevel(entry.type),
      };
    }
    permissionMap[entry.type].calls.push({
      api: entry.api,
      detail: entry.detail,
      timestamp: entry.timestamp,
    });
    permissionMap[entry.type].count++;
  });

  const permissions = Object.values(permissionMap);

  return {
    totalPermissionRequests: rawLog.length,
    uniquePermissionTypes: permissions.length,
    permissions,
    highRiskPermissions: permissions.filter((p) => p.riskLevel === 'High'),
  };
}

function getPermissionIcon(type) {
  const icons = {
    geolocation: '📍',
    'video/camera': '📷',
    'audio/microphone': '🎤',
    notifications: '🔔',
    'clipboard-read': '📋',
    'clipboard-write': '📋',
    fullscreen: '🖥️',
    'wake-lock': '☀️',
    'service-worker': '⚙️',
    'web-worker': '⚙️',
  };
  return icons[type] || '🔐';
}

function getPermissionRiskLevel(type) {
  const highRisk = ['geolocation', 'video/camera', 'audio/microphone', 'clipboard-read'];
  const mediumRisk = ['notifications', 'clipboard-write', 'fullscreen'];
  if (highRisk.includes(type)) return 'High';
  if (mediumRisk.includes(type)) return 'Medium';
  return 'Low';
}

module.exports = { getPermissionInjectionScript, collectPermissionResults };
