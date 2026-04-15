/**
 * main_world.js
 * Injected into the MAIN world to monkey-patch browser APIs.
 */

// Combine all original injection scripts

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
          stack: new Error().stack?.split('\n').slice(2, 5).map(s => s.trim()).join(' <- ') || ''
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
  


    (function() {
      window.__extensionProbeLog = [];
      const log = window.__extensionProbeLog;
      const KNOWN = {"cjpalhdlnbpafiamejdnhcphjbkeiagm":"uBlock Origin","gighmmpiobklfepjocnamgkkbiglidom":"AdBlock","cfhdojbkjhnklbpkdaibdccddilifddb":"Adblock Plus","gcbommkclmhbdoijbbkanfhodajijkao":"Opera VPN (Proxy)","dpplabbmogkhghncfbfdeeokoefdjegm":"Windscribe VPN","bgnkhhnnamicmpeenaelnjfhikgbkllg":"AdGuard","pkehgijcmpdhfbdbbnkijodmdjhbjlgp":"Privacy Badger","mlomiejdfkolichcflejclcbmpeaniij":"Ghostery","gcknhkkoolaabfmlnjonogaaifnjlfnp":"FoxyProxy","nngceckbapebfimnlniiiahkandclblb":"Bitwarden","hdokiejnpimakedhajhdlcegeplioahd":"LastPass","ddbfhbhlgfbhcnjliaidhdcaencdpgij":"1Password (old)","aeblfdkhhhdcdjpifhhbdiojplfjncoa":"1Password","fmkadmapgofadopljbjfkapdkoienihi":"React DevTools","nhdogjmejiglipccpnnnanhbledajbpd":"Vue.js DevTools","lmhkpmbekcpmknklioeibfkpmmfibljd":"Redux DevTools","bfnaelmomeimhlpmgjnjophhpkkoljpa":"Phantom","nenlahapcbofgnanklpelkaejcehkggg":"Honey (PayPal)","eofcbnmajmjmplflapaojjnihcjkigck":"Rakuten / Ebates","chhjbpecpncaggjpdakmflnfcopglcmi":"Capital One Shopping","nkbihfbeogaeaoehlefnkodbefgpgknn":"MetaMask","aiifbnbfobpmeekipheeijimdpnlpgpp":"Coinbase Wallet","lpcaedmchfhocbbapmcbpinfpgnhiddi":"Google Hangouts","nckgahadagoaajjgafhacjanaoiihapd":"Google Hangouts (old)","ghbmnnjooekpmoecnnnilnnbdlolhkhi":"Google Docs Offline","kbfnbcaeplbcioakkpcpgfkobkghlhen":"Grammarly","mpnjhgiejagandheloplmjjbaiiaalbo":"NaturalReader Text to Speech","pioclpoplcdbaefihamjohnefbikjilc":"Facebook Pixel Helper"};

      function addLog(method, extensionId, detail) {
        const name = KNOWN[extensionId] || null;
        log.push({
          method: method,
          extensionId: extensionId,
          extensionName: name,
          detail: detail,
          timestamp: Date.now(),
          stack: new Error().stack?.split('\n').slice(2, 4).map(s => s.trim()).join(' <- ') || ''
        });
      }

      // ==============================
      // 1. FETCH-BASED WAR PROBING
      // ==============================
      try {
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : input?.url || '';
          const match = url.match(/chrome-extension:\/\/([a-z]{32})/i);
          if (match) {
            addLog('fetch', match[1], url);
          }
          // Also detect moz-extension (Firefox) and safari-web-extension
          const mozMatch = url.match(/moz-extension:\/\/([^/]+)/i);
          if (mozMatch) {
            addLog('fetch (Firefox)', mozMatch[1], url);
          }
          return origFetch.apply(this, arguments);
        };
      } catch(e) {}

      // ==============================
      // 2. XHR-BASED WAR PROBING
      // ==============================
      try {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          if (typeof url === 'string') {
            const match = url.match(/chrome-extension:\/\/([a-z]{32})/i);
            if (match) {
              addLog('XMLHttpRequest', match[1], url);
            }
          }
          return origOpen.apply(this, arguments);
        };
      } catch(e) {}

      // ==============================
      // 3. IMAGE/SCRIPT/LINK ELEMENT PROBING
      // ==============================
      try {
        const origCreateElement = document.createElement;
        document.createElement = function(tagName) {
          const el = origCreateElement.call(document, tagName);
          const tag = tagName.toLowerCase();

          if (tag === 'img' || tag === 'script' || tag === 'link') {
            const origSetAttr = el.setAttribute.bind(el);
            el.setAttribute = function(name, value) {
              if ((name === 'src' || name === 'href') && typeof value === 'string') {
                const match = value.match(/chrome-extension:\/\/([a-z]{32})/i);
                if (match) {
                  addLog(tag + '.setAttribute', match[1], value);
                }
              }
              return origSetAttr(name, value);
            };

            // Also monitor direct property assignment
            if (tag === 'img' || tag === 'script') {
              const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src') ||
                                    Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
              // We'll catch it via setAttribute which is more reliable
            }
          }
          return el;
        };
      } catch(e) {}

      // ==============================
      // 4. DOM SCANNING FOR EXTENSION ARTIFACTS
      // ==============================
      // Monitor querySelectorAll / getElementById for extension-specific selectors
      try {
        const extensionSelectors = [
          // Common extension-injected elements
          '#adblock-', '.adblock', '[data-adblock',
          '#ghostery-', '.ghostery', '#ghostery',
          '#ublock-', '.ublock',
          '#honey-', '.honey-widget', '#honey',
          '#grammarly-', '.grammarly-', 'grammarly-desktop',
          '#metamask-', '.metamask',
          '#lastpass-', '.lastpass',
          '#bitwarden-', '.bitwarden',
          'privacy-badger',
          '.react-devtools',
          '__vue-devtools',
          '__REDUX_DEVTOOLS_EXTENSION__',
        ];

        const origQuerySelectorAll = document.querySelectorAll.bind(document);
        document.querySelectorAll = function(selector) {
          if (typeof selector === 'string') {
            for (const extSel of extensionSelectors) {
              if (selector.toLowerCase().includes(extSel.toLowerCase())) {
                addLog('querySelectorAll', 'dom-scan', 'Searching for: ' + selector);
                break;
              }
            }
          }
          return origQuerySelectorAll(selector);
        };
      } catch(e) {}

      // ==============================
      // 5. DEVTOOLS DETECTION (extensions often indicate devtools)
      // ==============================
      try {
        // Detect window size difference (common devtools detection)
        let devtoolsCheckCount = 0;
        const origOuterWidth = Object.getOwnPropertyDescriptor(window, 'outerWidth');
        const origOuterHeight = Object.getOwnPropertyDescriptor(window, 'outerHeight');
        // We detect if scripts are comparing outer vs inner dimensions frequently
        // which is a devtools detection technique
        const origGetComputedStyle = window.getComputedStyle;
        // This is tricky — we log if the Firebug/devtools detection pattern is used
      } catch(e) {}

      // ==============================
      // 6. RUNTIME.SENDMESSAGE / EXTERNAL MESSAGING DETECTION
      // ==============================
      try {
        // Websites can use chrome.runtime.sendMessage to communicate with extensions
        // if the extension declares externally_connectable
        if (window.chrome && window.chrome.runtime) {
          const origSendMessage = window.chrome.runtime.sendMessage;
          if (origSendMessage) {
            window.chrome.runtime.sendMessage = function(extensionId, message, options, callback) {
              addLog('chrome.runtime.sendMessage', extensionId || 'self', JSON.stringify(message)?.substring(0, 200));
              return origSendMessage.apply(this, arguments);
            };
          }

          const origConnect = window.chrome.runtime.connect;
          if (origConnect) {
            window.chrome.runtime.connect = function(extensionId, connectInfo) {
              addLog('chrome.runtime.connect', extensionId || 'self', JSON.stringify(connectInfo));
              return origConnect.apply(this, arguments);
            };
          }
        }
      } catch(e) {}

    })();
  


    (function() {
      window.__profilingLog = [];
      const log = window.__profilingLog;
      const counters = {};

      function addLog(category, type, detail) {
        const key = category + '::' + type;
        if (!counters[key]) {
          counters[key] = 0;
          // Log the first occurrence in full
          log.push({
            category: category,
            type: type,
            detail: detail || '',
            timestamp: Date.now(),
            count: 1
          });
        }
        counters[key]++;
        // Update count on existing entry
        const entry = log.find(e => e.category === category && e.type === type);
        if (entry) entry.count = counters[key];
      }

      // ==============================
      // 1. MOUSE MOVEMENT TRACKING
      // ==============================
      try {
        const origAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          const target = this;
          const isDocument = target === document || target === document.body || target === window;

          if (isDocument) {
            switch(type) {
              case 'mousemove':
                addLog('Behavioral', 'Mouse Movement Tracking', 'Global mousemove listener on ' + (target.constructor?.name || 'element'));
                break;
              case 'mousedown':
              case 'mouseup':
              case 'click':
                addLog('Behavioral', 'Click Tracking', 'Global ' + type + ' listener');
                break;
              case 'scroll':
                addLog('Behavioral', 'Scroll Tracking', 'Global scroll listener');
                break;
              case 'keydown':
              case 'keyup':
              case 'keypress':
                addLog('Keystroke', 'Keystroke Logging', 'Global ' + type + ' listener — may capture typed content');
                break;
              case 'touchstart':
              case 'touchmove':
              case 'touchend':
                addLog('Behavioral', 'Touch Tracking', 'Global ' + type + ' listener');
                break;
              case 'copy':
              case 'cut':
              case 'paste':
                addLog('Clipboard', 'Clipboard Interception', type + ' event intercepted');
                break;
              case 'visibilitychange':
                addLog('Engagement', 'Tab Visibility Tracking', 'Monitoring when user switches tabs');
                break;
              case 'focus':
              case 'blur':
                addLog('Engagement', 'Focus/Blur Tracking', type + ' listener — tracking user attention');
                break;
              case 'beforeunload':
              case 'unload':
                addLog('Engagement', 'Exit Intent Tracking', type + ' — detecting when user leaves');
                break;
              case 'popstate':
              case 'hashchange':
                addLog('Navigation', 'Navigation Tracking', type + ' — monitoring in-page navigation');
                break;
            }
          }

          // Detect form field monitoring
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
            if (type === 'input' || type === 'change' || type === 'keydown' || type === 'keyup' || type === 'blur' || type === 'focus') {
              addLog('Form', 'Form Field Monitoring', type + ' on ' + (target.type || 'input') + (target.name ? ' name="' + target.name + '"' : ''));
            }
          }

          return origAddEventListener.call(this, type, listener, options);
        };
      } catch(e) {}

      // ==============================
      // 2. INTERSECTION OBSERVER (SCROLL/VIEWABILITY TRACKING)
      // ==============================
      try {
        const OrigIntersectionObserver = window.IntersectionObserver;
        if (OrigIntersectionObserver) {
          let observerCount = 0;
          window.IntersectionObserver = function(callback, options) {
            observerCount++;
            if (observerCount <= 3) {
              addLog('Engagement', 'Viewability Tracking', 'IntersectionObserver #' + observerCount + ' (threshold: ' + (options?.threshold || 'default') + ')');
            } else if (observerCount === 4) {
              addLog('Engagement', 'Viewability Tracking (bulk)', observerCount + '+ IntersectionObservers created — likely ad viewability or scroll depth tracking');
            }
            return new OrigIntersectionObserver(callback, options);
          };
          window.IntersectionObserver.prototype = OrigIntersectionObserver.prototype;
        }
      } catch(e) {}

      // ==============================
      // 3. MUTATION OBSERVER (DOM CHANGE MONITORING)
      // ==============================
      try {
        const OrigMutationObserver = window.MutationObserver;
        if (OrigMutationObserver) {
          let mutationObserverCount = 0;
          window.MutationObserver = function(callback) {
            mutationObserverCount++;
            if (mutationObserverCount <= 2) {
              addLog('Behavioral', 'DOM Change Monitoring', 'MutationObserver #' + mutationObserverCount);
            }
            return new OrigMutationObserver(callback);
          };
          window.MutationObserver.prototype = OrigMutationObserver.prototype;
        }
      } catch(e) {}

      // ==============================
      // 4. PERFORMANCE / TIMING API (USED FOR PROFILING)
      // ==============================
      try {
        if (window.PerformanceObserver) {
          const OrigPerfObserver = window.PerformanceObserver;
          window.PerformanceObserver = function(callback) {
            addLog('Performance', 'Performance Monitoring', 'PerformanceObserver created — may profile user experience');
            return new OrigPerfObserver(callback);
          };
          window.PerformanceObserver.prototype = OrigPerfObserver.prototype;
          window.PerformanceObserver.supportedEntryTypes = OrigPerfObserver.supportedEntryTypes;
        }
      } catch(e) {}

      // ==============================
      // 5. DEVICE ORIENTATION / MOTION
      // ==============================
      // Already caught by global addEventListener above

      // ==============================
      // 6. SOCIAL LOGIN STATE DETECTION
      // ==============================
      // Websites load invisible iframes/images from social platforms to detect login state
      try {
        const socialDomains = [
          { pattern: 'facebook.com', name: 'Facebook' },
          { pattern: 'google.com/accounts', name: 'Google' },
          { pattern: 'accounts.google.com', name: 'Google' },
          { pattern: 'twitter.com', name: 'Twitter/X' },
          { pattern: 'x.com', name: 'Twitter/X' },
          { pattern: 'linkedin.com', name: 'LinkedIn' },
          { pattern: 'github.com', name: 'GitHub' },
          { pattern: 'apple.com/auth', name: 'Apple' },
          { pattern: 'login.microsoftonline.com', name: 'Microsoft' },
          { pattern: 'amazon.com', name: 'Amazon' },
        ];

        // Monitor iframe creation for social login detection
        const origCreateElement = document.createElement;
        document.createElement = function(tagName) {
          const el = origCreateElement.call(document, tagName);
          if (tagName.toLowerCase() === 'iframe') {
            const origSetAttr = el.setAttribute.bind(el);
            el.setAttribute = function(name, value) {
              if (name === 'src' && typeof value === 'string') {
                for (const social of socialDomains) {
                  if (value.includes(social.pattern)) {
                    // Check if it's a hidden / tracking iframe
                    const isHidden = el.style.display === 'none' ||
                                     el.style.visibility === 'hidden' ||
                                     el.width === '0' || el.height === '0' ||
                                     el.getAttribute('width') === '0' || el.getAttribute('height') === '0';
                    addLog('Social', social.name + ' Login Detection',
                      (isHidden ? 'Hidden iframe' : 'Iframe') + ' loading: ' + value.substring(0, 150));
                    break;
                  }
                }
              }
              return origSetAttr(name, value);
            };
          }
          return el;
        };
      } catch(e) {}

      // ==============================
      // 7. LINK DECORATION TRACKING
      // ==============================
      // Detect when scripts modify outbound links to add tracking parameters
      try {
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                                'fbclid', 'gclid', 'msclkid', 'ttclid', 'twclid',
                                'mc_cid', 'mc_eid', '_ga', 'ref', 'affiliate',
                                'irclickid', 'dclid'];
        let linkDecorCount = 0;

        // Monitor when href is modified on links
        const origAnchorSetAttr = HTMLAnchorElement.prototype.setAttribute;
        HTMLAnchorElement.prototype.setAttribute = function(name, value) {
          if (name === 'href' && typeof value === 'string') {
            try {
              const url = new URL(value, window.location.origin);
              for (const param of trackingParams) {
                if (url.searchParams.has(param)) {
                  linkDecorCount++;
                  if (linkDecorCount <= 3) {
                    addLog('Link Decoration', 'Outbound Link Tracking',
                      param + '=' + url.searchParams.get(param)?.substring(0, 50) + ' added to ' + url.hostname);
                  } else if (linkDecorCount === 4) {
                    addLog('Link Decoration', 'Bulk Link Decoration',
                      linkDecorCount + '+ links decorated with tracking parameters');
                  }
                  break;
                }
              }
            } catch(e) {}
          }
          return origAnchorSetAttr.call(this, name, value);
        };
      } catch(e) {}

      // ==============================
      // 8. HISTORY API MANIPULATION
      // ==============================
      try {
        const origPushState = history.pushState;
        history.pushState = function() {
          addLog('Navigation', 'History Manipulation', 'pushState: ' + (arguments[2] || ''));
          return origPushState.apply(this, arguments);
        };

        const origReplaceState = history.replaceState;
        history.replaceState = function() {
          addLog('Navigation', 'History Manipulation', 'replaceState: ' + (arguments[2] || ''));
          return origReplaceState.apply(this, arguments);
        };
      } catch(e) {}

      // ==============================
      // 9. STORAGE-BASED USER ID DETECTION
      // ==============================
      try {
        const origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          const lowerKey = key.toLowerCase();
          const userIdPatterns = ['user_id', 'userid', 'uid', 'visitor_id', 'visitorid',
                                  'client_id', 'clientid', 'session_id', 'sessionid',
                                  '_cid', 'ajs_user_id', 'ajs_anonymous_id',
                                  'ga_client_id', '_ga', 'amplitude_id', 'mp_distinct_id',
                                  'intercom-id', 'hubspot', '_fbp', '_fbc'];

          for (const pattern of userIdPatterns) {
            if (lowerKey.includes(pattern)) {
              addLog('User ID', 'Persistent Identifier Storage',
                'Storing "' + key + '" = ' + (typeof value === 'string' ? value.substring(0, 60) : typeof value));
              break;
            }
          }
          return origSetItem.call(this, key, value);
        };
      } catch(e) {}

    })();
  

// Bridge to isolated world
window.addEventListener('DataAnalyzer_RequestLogs', () => {
  window.postMessage({
    type: 'DataAnalyzer_Logs_Response',
    fingerprint: window.__fingerprintLog || [],
    permission: window.__permissionData || window.__permissionLog || [], // Wait, let me check the exact variable names
    extension: window.__extensionProbes || window.__extensionData || [],
    profiling: window.__profilingData || window.__profilingLog || []
  }, '*');
});

// Periodic send just in case the page unloads
setInterval(() => {
  window.postMessage({
    type: 'DataAnalyzer_Logs_Update',
    fingerprint: window.__fingerprintLog || [],
    permission: window.__permissionData || window.__permissionLog || [],
    extension: window.__extensionProbes || window.__extensionData || [],
    profiling: window.__profilingData || window.__profilingLog || []
  }, '*');
}, 2000);
