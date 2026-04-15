/**
 * profilingAnalyzer.js
 * Detects user profiling and behavioral tracking techniques used by websites.
 *
 * Monitors for:
 * 1. Mouse movement tracking (heatmap/session replay)
 * 2. Keystroke logging / form field monitoring
 * 3. Scroll depth tracking
 * 4. Copy/paste interception
 * 5. Visibility & focus change tracking
 * 6. Touch event tracking
 * 7. Social login state detection (e.g., detecting if user is logged into Facebook/Google)
 * 8. Link decoration (adding tracking params to outbound links)
 * 9. Device orientation / motion tracking
 */

/**
 * Returns JavaScript code to inject before page load.
 * Monitors for user profiling & behavioral tracking.
 */
function getProfilingInjectionScript() {
  return `
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
  `;
}

/**
 * Collect profiling results from the page
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} Profiling analysis results
 */
async function collectProfilingResults(page) {
  const rawLog = await page.evaluate(() => {
    return window.__profilingLog || [];
  });

  // Group by category
  const categories = {};
  rawLog.forEach((entry) => {
    if (!categories[entry.category]) {
      categories[entry.category] = {
        category: entry.category,
        items: [],
        totalEvents: 0,
        icon: getCategoryIcon(entry.category),
        riskLevel: getCategoryRisk(entry.category),
      };
    }
    categories[entry.category].items.push({
      type: entry.type,
      detail: entry.detail,
      count: entry.count,
    });
    categories[entry.category].totalEvents += entry.count;
  });

  const categoryList = Object.values(categories);

  // Calculate profiling intensity score
  const intensityScore = calculateProfilingIntensity(categoryList);

  return {
    totalTrackingVectors: rawLog.length,
    categoriesDetected: categoryList.length,
    categories: categoryList,
    intensityScore,
    intensityLevel: intensityScore > 70 ? 'Aggressive' : intensityScore > 40 ? 'Moderate' : intensityScore > 10 ? 'Minimal' : 'None',
    highlights: getProfilingHighlights(categoryList),
  };
}

function getCategoryIcon(category) {
  const icons = {
    'Behavioral': '🖱️',
    'Keystroke': '⌨️',
    'Clipboard': '📋',
    'Engagement': '👁️',
    'Form': '📝',
    'Social': '👤',
    'Navigation': '🧭',
    'Link Decoration': '🔗',
    'User ID': '🆔',
    'Performance': '⚡',
  };
  return icons[category] || '📊';
}

function getCategoryRisk(category) {
  const high = ['Keystroke', 'Social', 'Clipboard', 'User ID'];
  const medium = ['Behavioral', 'Form', 'Engagement'];
  if (high.includes(category)) return 'High';
  if (medium.includes(category)) return 'Medium';
  return 'Low';
}

function calculateProfilingIntensity(categories) {
  let score = 0;
  const weights = {
    'Keystroke': 20,
    'Social': 18,
    'User ID': 15,
    'Clipboard': 15,
    'Form': 12,
    'Behavioral': 8,
    'Engagement': 5,
    'Link Decoration': 5,
    'Navigation': 3,
    'Performance': 2,
  };

  categories.forEach((cat) => {
    score += weights[cat.category] || 3;
    // Bonus for high event counts (aggressive tracking)
    if (cat.totalEvents > 10) score += 5;
  });

  return Math.min(100, score);
}

function getProfilingHighlights(categories) {
  const highlights = [];
  categories.forEach((cat) => {
    if (cat.category === 'Keystroke') {
      highlights.push('⚠️ Keystroke logging detected — the site monitors your keyboard input');
    }
    if (cat.category === 'Social') {
      highlights.push('⚠️ Social login detection — the site tries to check if you\'re logged into social platforms');
    }
    if (cat.category === 'Behavioral' && cat.items.some((i) => i.type.includes('Mouse'))) {
      highlights.push('🖱️ Mouse movement tracking — the site records your cursor position (session replay / heatmaps)');
    }
    if (cat.category === 'Form') {
      highlights.push('📝 Form field monitoring — the site watches what you type in forms even before submission');
    }
    if (cat.category === 'User ID') {
      highlights.push('🆔 Persistent user identifier — the site stores a unique ID to track you across visits');
    }
    if (cat.category === 'Clipboard') {
      highlights.push('📋 Clipboard interception — the site monitors your copy/paste activity');
    }
  });
  return highlights;
}

module.exports = { getProfilingInjectionScript, collectProfilingResults };
