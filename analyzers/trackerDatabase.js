/**
 * trackerDatabase.js
 * Curated database of known tracker, analytics, advertising, and fingerprinting domains.
 * Used to classify third-party network requests.
 */

const TRACKER_CATEGORIES = {
  ANALYTICS: 'Analytics',
  ADVERTISING: 'Advertising',
  SOCIAL: 'Social Media',
  FINGERPRINTING: 'Fingerprinting',
  CDN: 'CDN / Tag Manager',
  CUSTOMER_DATA: 'Customer Data Platform',
  SESSION_REPLAY: 'Session Replay',
  CONSENT: 'Consent Management',
};

// Map of domain patterns to their category and name
const KNOWN_TRACKERS = [
  // === Analytics ===
  { pattern: 'google-analytics.com', name: 'Google Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'analytics.google.com', name: 'Google Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'googletagmanager.com', name: 'Google Tag Manager', category: TRACKER_CATEGORIES.CDN },
  { pattern: 'stats.g.doubleclick.net', name: 'Google DoubleClick', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'doubleclick.net', name: 'Google DoubleClick', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'googlesyndication.com', name: 'Google Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'googleadservices.com', name: 'Google Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'google.com/pagead', name: 'Google Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'adservice.google.com', name: 'Google Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'googleads.g.doubleclick.net', name: 'Google Ads', category: TRACKER_CATEGORIES.ADVERTISING },

  // === Facebook / Meta ===
  { pattern: 'facebook.net', name: 'Facebook Pixel', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'facebook.com/tr', name: 'Facebook Pixel', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'connect.facebook.net', name: 'Facebook SDK', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'graph.facebook.com', name: 'Facebook Graph API', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'pixel.facebook.com', name: 'Facebook Pixel', category: TRACKER_CATEGORIES.SOCIAL },

  // === Twitter / X ===
  { pattern: 'analytics.twitter.com', name: 'Twitter Analytics', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'platform.twitter.com', name: 'Twitter Platform', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 't.co', name: 'Twitter Redirect', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'ads-twitter.com', name: 'Twitter Ads', category: TRACKER_CATEGORIES.ADVERTISING },

  // === Microsoft / LinkedIn ===
  { pattern: 'clarity.ms', name: 'Microsoft Clarity', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'bat.bing.com', name: 'Bing Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'snap.licdn.com', name: 'LinkedIn Insight', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'linkedin.com/px', name: 'LinkedIn Pixel', category: TRACKER_CATEGORIES.SOCIAL },

  // === Amazon ===
  { pattern: 'amazon-adsystem.com', name: 'Amazon Ads', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'assoc-amazon.com', name: 'Amazon Associates', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'fls-na.amazon.com', name: 'Amazon Analytics', category: TRACKER_CATEGORIES.ANALYTICS },

  // === Analytics Platforms ===
  { pattern: 'hotjar.com', name: 'Hotjar', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'script.hotjar.com', name: 'Hotjar', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'fullstory.com', name: 'FullStory', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'mouseflow.com', name: 'Mouseflow', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'luckyorange.com', name: 'Lucky Orange', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'crazyegg.com', name: 'Crazy Egg', category: TRACKER_CATEGORIES.SESSION_REPLAY },
  { pattern: 'heap.io', name: 'Heap Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'heapanalytics.com', name: 'Heap Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'mixpanel.com', name: 'Mixpanel', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'cdn.mxpnl.com', name: 'Mixpanel', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'amplitude.com', name: 'Amplitude', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'segment.com', name: 'Segment', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'segment.io', name: 'Segment', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'cdn.segment.com', name: 'Segment', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'matomo.cloud', name: 'Matomo', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'plausible.io', name: 'Plausible', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'newrelic.com', name: 'New Relic', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'nr-data.net', name: 'New Relic', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'sentry.io', name: 'Sentry', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'datadoghq.com', name: 'Datadog', category: TRACKER_CATEGORIES.ANALYTICS },

  // === Advertising Networks ===
  { pattern: 'criteo.com', name: 'Criteo', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'criteo.net', name: 'Criteo', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'outbrain.com', name: 'Outbrain', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'taboola.com', name: 'Taboola', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'adnxs.com', name: 'AppNexus (Xandr)', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'adsrvr.org', name: 'The Trade Desk', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'pubmatic.com', name: 'PubMatic', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'rubiconproject.com', name: 'Rubicon Project', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'casalemedia.com', name: 'Index Exchange', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'openx.net', name: 'OpenX', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'sharethis.com', name: 'ShareThis', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'addthis.com', name: 'AddThis', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'moatads.com', name: 'Moat (Oracle)', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'quantserve.com', name: 'Quantcast', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'scorecardresearch.com', name: 'Scorecard Research', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'demdex.net', name: 'Adobe Audience Manager', category: TRACKER_CATEGORIES.ADVERTISING },
  { pattern: 'omtrdc.net', name: 'Adobe Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'adobedtm.com', name: 'Adobe Launch', category: TRACKER_CATEGORIES.CDN },

  // === Social Widgets ===
  { pattern: 'pinterest.com/ct', name: 'Pinterest', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'ct.pinterest.com', name: 'Pinterest', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'snap.com', name: 'Snapchat Pixel', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'sc-static.net', name: 'Snapchat', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'tiktok.com', name: 'TikTok Pixel', category: TRACKER_CATEGORIES.SOCIAL },
  { pattern: 'analytics.tiktok.com', name: 'TikTok Analytics', category: TRACKER_CATEGORIES.SOCIAL },

  // === Fingerprinting / Bot Detection ===
  { pattern: 'fingerprintjs.com', name: 'FingerprintJS', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'fpjs.io', name: 'FingerprintJS', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'arkoselabs.com', name: 'Arkose Labs', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'perimeterx.net', name: 'PerimeterX', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'px-cdn.net', name: 'PerimeterX', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'datadome.co', name: 'DataDome', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'kasada.io', name: 'Kasada', category: TRACKER_CATEGORIES.FINGERPRINTING },
  { pattern: 'shape.com', name: 'Shape Security', category: TRACKER_CATEGORIES.FINGERPRINTING },

  // === Consent Management ===
  { pattern: 'cookiebot.com', name: 'Cookiebot', category: TRACKER_CATEGORIES.CONSENT },
  { pattern: 'onetrust.com', name: 'OneTrust', category: TRACKER_CATEGORIES.CONSENT },
  { pattern: 'cookielaw.org', name: 'OneTrust/CookieLaw', category: TRACKER_CATEGORIES.CONSENT },
  { pattern: 'trustarc.com', name: 'TrustArc', category: TRACKER_CATEGORIES.CONSENT },
  { pattern: 'quantcast.com', name: 'Quantcast Choice', category: TRACKER_CATEGORIES.CONSENT },

  // === Chat / Customer Support ===
  { pattern: 'intercom.io', name: 'Intercom', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'intercomcdn.com', name: 'Intercom', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'drift.com', name: 'Drift', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'zendesk.com', name: 'Zendesk', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'zdassets.com', name: 'Zendesk', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'hubspot.com', name: 'HubSpot', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'hs-scripts.com', name: 'HubSpot', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'hsforms.com', name: 'HubSpot Forms', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'freshchat.com', name: 'Freshchat', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'livechatinc.com', name: 'LiveChat', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'tawk.to', name: 'Tawk.to', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'crisp.chat', name: 'Crisp', category: TRACKER_CATEGORIES.CUSTOMER_DATA },

  // === Email Marketing ===
  { pattern: 'mailchimp.com', name: 'Mailchimp', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'list-manage.com', name: 'Mailchimp', category: TRACKER_CATEGORIES.CUSTOMER_DATA },
  { pattern: 'klaviyo.com', name: 'Klaviyo', category: TRACKER_CATEGORIES.CUSTOMER_DATA },

  // === Other ===
  { pattern: 'cloudflare.com/cdn-cgi', name: 'Cloudflare Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'cloudflareinsights.com', name: 'Cloudflare Web Analytics', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'optimizely.com', name: 'Optimizely', category: TRACKER_CATEGORIES.ANALYTICS },
  { pattern: 'launchdarkly.com', name: 'LaunchDarkly', category: TRACKER_CATEGORIES.ANALYTICS },
];

/**
 * Check if a URL belongs to a known tracker
 * @param {string} url - The URL to check
 * @returns {{ isTracker: boolean, name?: string, category?: string }}
 */
function classifyUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const tracker of KNOWN_TRACKERS) {
      if (hostname.includes(tracker.pattern) || url.includes(tracker.pattern)) {
        return { isTracker: true, name: tracker.name, category: tracker.category };
      }
    }
  } catch {
    // Invalid URL
  }
  return { isTracker: false };
}

/**
 * Check if a domain is a known tracker
 * @param {string} domain - The domain to check
 * @returns {{ isTracker: boolean, name?: string, category?: string }}
 */
function classifyDomain(domain) {
  const lowerDomain = domain.toLowerCase();
  for (const tracker of KNOWN_TRACKERS) {
    if (lowerDomain.includes(tracker.pattern)) {
      return { isTracker: true, name: tracker.name, category: tracker.category };
    }
  }
  return { isTracker: false };
}

module.exports = {
  TRACKER_CATEGORIES,
  KNOWN_TRACKERS,
  classifyUrl,
  classifyDomain,
};
