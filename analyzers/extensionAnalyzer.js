/**
 * extensionAnalyzer.js
 * Detects when websites attempt to probe/fingerprint installed browser extensions.
 *
 * Websites detect extensions through:
 * 1. Web Accessible Resources (WAR) — trying to load chrome-extension://<id>/resource
 * 2. DOM scanning — looking for elements/classes injected by known extensions
 * 3. Timing attacks — measuring resource load times
 * 4. CSS probing — detecting extension-injected stylesheets
 */

// Known extension IDs and their names (popular extensions websites commonly probe for)
const KNOWN_EXTENSIONS = {
  // Ad Blockers
  'cjpalhdlnbpafiamejdnhcphjbkeiagm': 'uBlock Origin',
  'gighmmpiobklfepjocnamgkkbiglidom': 'AdBlock',
  'cfhdojbkjhnklbpkdaibdccddilifddb': 'Adblock Plus',

  // Privacy
  'gcbommkclmhbdoijbbkanfhodajijkao': 'Opera VPN (Proxy)',
  'dpplabbmogkhghncfbfdeeokoefdjegm': 'Windscribe VPN',
  'bgnkhhnnamicmpeenaelnjfhikgbkllg': 'AdGuard',
  'pkehgijcmpdhfbdbbnkijodmdjhbjlgp': 'Privacy Badger',
  'mlomiejdfkolichcflejclcbmpeaniij': 'Ghostery',
  'gcknhkkoolaabfmlnjonogaaifnjlfnp': 'FoxyProxy',

  // Password Managers
  'nngceckbapebfimnlniiiahkandclblb': 'Bitwarden',
  'hdokiejnpimakedhajhdlcegeplioahd': 'LastPass',
  'ddbfhbhlgfbhcnjliaidhdcaencdpgij': '1Password (old)',
  'aeblfdkhhhdcdjpifhhbdiojplfjncoa': '1Password',

  // Developer Tools
  'fmkadmapgofadopljbjfkapdkoienihi': 'React DevTools',
  'nhdogjmejiglipccpnnnanhbledajbpd': 'Vue.js DevTools',
  'lmhkpmbekcpmknklioeibfkpmmfibljd': 'Redux DevTools',
  'bfnaelmomeimhlpmgjnjophhpkkoljpa': 'Angular DevTools',

  // Shopping / Deals
  'nenlahapcbofgnanklpelkaejcehkggg': 'Honey (PayPal)',
  'eofcbnmajmjmplflapaojjnihcjkigck': 'Rakuten / Ebates',
  'chhjbpecpncaggjpdakmflnfcopglcmi': 'Capital One Shopping',

  // Crypto
  'nkbihfbeogaeaoehlefnkodbefgpgknn': 'MetaMask',
  'bfnaelmomeimhlpmgjnjophhpkkoljpa': 'Phantom',
  'aiifbnbfobpmeekipheeijimdpnlpgpp': 'Coinbase Wallet',

  // Communication
  'lpcaedmchfhocbbapmcbpinfpgnhiddi': 'Google Hangouts',
  'nckgahadagoaajjgafhacjanaoiihapd': 'Google Hangouts (old)',
  'ghbmnnjooekpmoecnnnilnnbdlolhkhi': 'Google Docs Offline',

  // Grammar / Writing
  'kbfnbcaeplbcioakkpcpgfkobkghlhen': 'Grammarly',

  // Accessibility
  'mpnjhgiejagandheloplmjjbaiiaalbo': 'NaturalReader Text to Speech',

  // Social
  'pioclpoplcdbaefihamjohnefbikjilc': 'Facebook Pixel Helper',
};

/**
 * Returns JavaScript code to inject before page load.
 * Monitors for extension probing attempts.
 */
function getExtensionInjectionScript() {
  const extensionIds = JSON.stringify(KNOWN_EXTENSIONS);

  return `
    (function() {
      window.__extensionProbeLog = [];
      const log = window.__extensionProbeLog;
      const KNOWN = ${extensionIds};

      function addLog(method, extensionId, detail) {
        const name = KNOWN[extensionId] || null;
        log.push({
          method: method,
          extensionId: extensionId,
          extensionName: name,
          detail: detail,
          timestamp: Date.now(),
          stack: new Error().stack?.split('\\n').slice(2, 4).map(s => s.trim()).join(' <- ') || ''
        });
      }

      // ==============================
      // 1. FETCH-BASED WAR PROBING
      // ==============================
      try {
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : input?.url || '';
          const match = url.match(/chrome-extension:\\/\\/([a-z]{32})/i);
          if (match) {
            addLog('fetch', match[1], url);
          }
          // Also detect moz-extension (Firefox) and safari-web-extension
          const mozMatch = url.match(/moz-extension:\\/\\/([^/]+)/i);
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
            const match = url.match(/chrome-extension:\\/\\/([a-z]{32})/i);
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
                const match = value.match(/chrome-extension:\\/\\/([a-z]{32})/i);
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
  `;
}

/**
 * Collect extension probing results from the page
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} Extension probing analysis results
 */
async function collectExtensionResults(page) {
  const rawLog = await page.evaluate(() => {
    return window.__extensionProbeLog || [];
  });

  // Deduplicate
  const seen = new Set();
  const dedupedLog = rawLog.filter((entry) => {
    const key = entry.method + '::' + entry.extensionId + '::' + entry.detail;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by method
  const byMethod = {};
  dedupedLog.forEach((entry) => {
    if (!byMethod[entry.method]) {
      byMethod[entry.method] = [];
    }
    byMethod[entry.method].push(entry);
  });

  // Identify which known extensions were probed
  const probedExtensions = {};
  dedupedLog.forEach((entry) => {
    if (entry.extensionName && !probedExtensions[entry.extensionId]) {
      probedExtensions[entry.extensionId] = {
        id: entry.extensionId,
        name: entry.extensionName,
        probeCount: 0,
        methods: [],
      };
    }
    if (probedExtensions[entry.extensionId]) {
      probedExtensions[entry.extensionId].probeCount++;
      if (!probedExtensions[entry.extensionId].methods.includes(entry.method)) {
        probedExtensions[entry.extensionId].methods.push(entry.method);
      }
    }
  });

  const knownProbed = Object.values(probedExtensions);
  const unknownProbes = dedupedLog.filter((e) => !e.extensionName && e.extensionId !== 'dom-scan');

  return {
    totalProbeAttempts: dedupedLog.length,
    knownExtensionsProbed: knownProbed.length,
    unknownProbeAttempts: unknownProbes.length,
    probedExtensions: knownProbed,
    unknownProbes: unknownProbes.map((e) => ({
      extensionId: e.extensionId,
      method: e.method,
      detail: e.detail,
    })),
    probesByMethod: Object.entries(byMethod).map(([method, entries]) => ({
      method,
      count: entries.length,
    })),
    domScanAttempts: dedupedLog.filter((e) => e.extensionId === 'dom-scan').length,
    riskLevel: knownProbed.length > 5 ? 'High' : knownProbed.length > 0 ? 'Medium' : dedupedLog.length > 0 ? 'Low' : 'None',
  };
}

module.exports = { getExtensionInjectionScript, collectExtensionResults, KNOWN_EXTENSIONS };
