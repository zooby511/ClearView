/**
 * fingerprintAnalyzer.js
 * Detects browser fingerprinting attempts by injecting API monitors
 * that log when websites access fingerprinting-prone browser APIs.
 */

/**
 * Returns JavaScript code to inject before page load.
 * This code wraps fingerprinting-prone APIs with logging proxies.
 * Results are stored in window.__fingerprintLog.
 */
function getFingerprintInjectionScript() {
  return `
    (function() {
      // Initialize the fingerprint log
      window.__fingerprintLog = [];
      const log = window.__fingerprintLog;

      function addLog(category, api, detail) {
        log.push({
          category: category,
          api: api,
          detail: detail || '',
          timestamp: Date.now(),
          stack: new Error().stack?.split('\\n').slice(2, 5).map(s => s.trim()).join(' <- ') || ''
        });
      }

      // ==============================
      // 1. CANVAS FINGERPRINTING
      // ==============================
      try {
        const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          addLog('Canvas', 'toDataURL', 'type=' + (args[0] || 'image/png'));
          return origToDataURL.apply(this, args);
        };

        const origToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(...args) {
          addLog('Canvas', 'toBlob', 'type=' + (args[1] || 'image/png'));
          return origToBlob.apply(this, args);
        };

        const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function(...args) {
          addLog('Canvas', 'getImageData', args[0] + ',' + args[1] + ',' + args[2] + ',' + args[3]);
          return origGetImageData.apply(this, args);
        };
      } catch(e) {}

      // ==============================
      // 2. WEBGL FINGERPRINTING
      // ==============================
      try {
        const origGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
          const WEBGL_PARAMS = {
            7936: 'VENDOR', 7937: 'RENDERER', 7938: 'VERSION',
            35724: 'SHADING_LANGUAGE_VERSION',
            34047: 'MAX_TEXTURE_MAX_ANISOTROPY_EXT'
          };
          if (WEBGL_PARAMS[param]) {
            addLog('WebGL', 'getParameter', WEBGL_PARAMS[param]);
          }
          return origGetParameter.apply(this, arguments);
        };

        if (typeof WebGL2RenderingContext !== 'undefined') {
          const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function(param) {
            const WEBGL_PARAMS = {
              7936: 'VENDOR', 7937: 'RENDERER', 7938: 'VERSION',
              35724: 'SHADING_LANGUAGE_VERSION',
            };
            if (WEBGL_PARAMS[param]) {
              addLog('WebGL', 'getParameter (WebGL2)', WEBGL_PARAMS[param]);
            }
            return origGetParameter2.apply(this, arguments);
          };
        }

        // Monitor getExtension for debug renderer info
        const origGetExtension = WebGLRenderingContext.prototype.getExtension;
        WebGLRenderingContext.prototype.getExtension = function(name) {
          if (name === 'WEBGL_debug_renderer_info') {
            addLog('WebGL', 'getExtension', 'WEBGL_debug_renderer_info');
          }
          return origGetExtension.apply(this, arguments);
        };
      } catch(e) {}

      // ==============================
      // 3. AUDIO FINGERPRINTING
      // ==============================
      try {
        const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
        if (OrigAudioContext) {
          const origCreateOscillator = OrigAudioContext.prototype.createOscillator;
          OrigAudioContext.prototype.createOscillator = function() {
            addLog('Audio', 'createOscillator', 'AudioContext fingerprinting');
            return origCreateOscillator.apply(this, arguments);
          };

          const origCreateAnalyser = OrigAudioContext.prototype.createAnalyser;
          OrigAudioContext.prototype.createAnalyser = function() {
            addLog('Audio', 'createAnalyser', 'AudioContext fingerprinting');
            return origCreateAnalyser.apply(this, arguments);
          };

          const origCreateDynamicsCompressor = OrigAudioContext.prototype.createDynamicsCompressor;
          OrigAudioContext.prototype.createDynamicsCompressor = function() {
            addLog('Audio', 'createDynamicsCompressor', 'AudioContext fingerprinting');
            return origCreateDynamicsCompressor.apply(this, arguments);
          };
        }
      } catch(e) {}

      // ==============================
      // 4. NAVIGATOR PROPERTIES
      // ==============================
      try {
        const navigatorProps = [
          'userAgent', 'platform', 'language', 'languages',
          'hardwareConcurrency', 'deviceMemory', 'maxTouchPoints',
          'vendor', 'appVersion', 'appName', 'product', 'productSub',
          'oscpu', 'cpuClass'
        ];

        navigatorProps.forEach(prop => {
          const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, prop) ||
                             Object.getOwnPropertyDescriptor(navigator, prop);
          if (descriptor && descriptor.get) {
            const origGet = descriptor.get;
            Object.defineProperty(Navigator.prototype, prop, {
              get: function() {
                const val = origGet.call(this);
                addLog('Navigator', 'navigator.' + prop, String(val).substring(0, 100));
                return val;
              },
              configurable: true
            });
          }
        });
      } catch(e) {}

      // ==============================
      // 5. SCREEN PROPERTIES
      // ==============================
      try {
        const screenProps = ['width', 'height', 'colorDepth', 'pixelDepth', 'availWidth', 'availHeight'];
        screenProps.forEach(prop => {
          const descriptor = Object.getOwnPropertyDescriptor(Screen.prototype, prop);
          if (descriptor && descriptor.get) {
            const origGet = descriptor.get;
            Object.defineProperty(Screen.prototype, prop, {
              get: function() {
                const val = origGet.call(this);
                addLog('Screen', 'screen.' + prop, String(val));
                return val;
              },
              configurable: true
            });
          }
        });
      } catch(e) {}

      // ==============================
      // 6. BATTERY API
      // ==============================
      try {
        if (navigator.getBattery) {
          const origGetBattery = navigator.getBattery.bind(navigator);
          navigator.getBattery = function() {
            addLog('Battery', 'navigator.getBattery', 'Battery status requested');
            return origGetBattery();
          };
        }
      } catch(e) {}

      // ==============================
      // 7. NETWORK INFORMATION
      // ==============================
      try {
        if (navigator.connection) {
          const connProps = ['effectiveType', 'downlink', 'rtt', 'saveData', 'type'];
          connProps.forEach(prop => {
            const descriptor = Object.getOwnPropertyDescriptor(
              navigator.connection.__proto__, prop
            );
            if (descriptor && descriptor.get) {
              const origGet = descriptor.get;
              Object.defineProperty(navigator.connection.__proto__, prop, {
                get: function() {
                  const val = origGet.call(this);
                  addLog('Network', 'navigator.connection.' + prop, String(val));
                  return val;
                },
                configurable: true
              });
            }
          });
        }
      } catch(e) {}

      // ==============================
      // 8. MEDIA DEVICES ENUMERATION
      // ==============================
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
          navigator.mediaDevices.enumerateDevices = function() {
            addLog('MediaDevices', 'enumerateDevices', 'Device enumeration requested');
            return origEnumerate();
          };
        }
      } catch(e) {}

      // ==============================
      // 9. FONT DETECTION
      // ==============================
      try {
        if (document.fonts && document.fonts.check) {
          const origCheck = document.fonts.check.bind(document.fonts);
          let fontCheckCount = 0;
          document.fonts.check = function(font, text) {
            fontCheckCount++;
            if (fontCheckCount <= 5 || fontCheckCount % 50 === 0) {
              addLog('Fonts', 'document.fonts.check', font + ' (call #' + fontCheckCount + ')');
            }
            return origCheck(font, text);
          };
        }
      } catch(e) {}

      // ==============================
      // 10. WEBRTC (LOCAL IP DETECTION)
      // ==============================
      try {
        const OrigRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (OrigRTCPeerConnection) {
          window.RTCPeerConnection = function(...args) {
            addLog('WebRTC', 'RTCPeerConnection', 'Created — may expose local IP');
            return new OrigRTCPeerConnection(...args);
          };
          window.RTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
        }
      } catch(e) {}

      // ==============================
      // 11. SENDBEACON
      // ==============================
      try {
        const origSendBeacon = navigator.sendBeacon?.bind(navigator);
        if (origSendBeacon) {
          navigator.sendBeacon = function(url, data) {
            addLog('Beacon', 'navigator.sendBeacon', url);
            return origSendBeacon(url, data);
          };
        }
      } catch(e) {}

      // ==============================
      // 12. DATE / TIMEZONE
      // ==============================
      try {
        const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
        Intl.DateTimeFormat.prototype.resolvedOptions = function() {
          addLog('Timezone', 'Intl.DateTimeFormat.resolvedOptions', '');
          return origResolvedOptions.apply(this, arguments);
        };
      } catch(e) {}

    })();
  `;
}

/**
 * Collect the fingerprint log from the page
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} Fingerprinting analysis results
 */
async function collectFingerprintResults(page) {
  const rawLog = await page.evaluate(() => {
    return window.__fingerprintLog || [];
  });

  // Deduplicate by category+api (keep first occurrence and count)
  const deduped = {};
  rawLog.forEach((entry) => {
    const key = entry.category + '::' + entry.api;
    if (!deduped[key]) {
      deduped[key] = { ...entry, count: 1 };
    } else {
      deduped[key].count++;
    }
  });

  const entries = Object.values(deduped);

  // Group by category
  const categories = {};
  entries.forEach((entry) => {
    if (!categories[entry.category]) {
      categories[entry.category] = {
        category: entry.category,
        apis: [],
        totalCalls: 0,
        riskLevel: getCategoryRiskLevel(entry.category),
      };
    }
    categories[entry.category].apis.push({
      api: entry.api,
      detail: entry.detail,
      count: entry.count,
      stack: entry.stack,
    });
    categories[entry.category].totalCalls += entry.count;
  });

  const categoryList = Object.values(categories);

  // Calculate risk score (0-100)
  const riskScore = calculateFingerprintRiskScore(categoryList);

  return {
    totalApiCalls: rawLog.length,
    uniqueApis: entries.length,
    categoriesDetected: categoryList.length,
    categories: categoryList,
    riskScore,
    riskLevel: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
    rawLogCount: rawLog.length,
  };
}

/**
 * Get risk level for a fingerprinting category
 */
function getCategoryRiskLevel(category) {
  const highRisk = ['Canvas', 'WebGL', 'Audio', 'WebRTC', 'Fonts'];
  const mediumRisk = ['Navigator', 'Screen', 'Battery', 'Network', 'MediaDevices'];
  const lowRisk = ['Timezone', 'Beacon'];

  if (highRisk.includes(category)) return 'High';
  if (mediumRisk.includes(category)) return 'Medium';
  return 'Low';
}

/**
 * Calculate an overall fingerprinting risk score
 */
function calculateFingerprintRiskScore(categories) {
  let score = 0;
  const weights = {
    Canvas: 20,
    WebGL: 18,
    Audio: 15,
    WebRTC: 15,
    Fonts: 12,
    Navigator: 5,
    Screen: 3,
    Battery: 8,
    Network: 5,
    MediaDevices: 10,
    Timezone: 2,
    Beacon: 3,
  };

  categories.forEach((cat) => {
    score += weights[cat.category] || 3;
  });

  return Math.min(100, score);
}

module.exports = { getFingerprintInjectionScript, collectFingerprintResults };
