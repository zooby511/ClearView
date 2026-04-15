/**
 * cookieAnalyzer.js
 * Collects and classifies all cookies set by a website.
 * Identifies first-party vs third-party cookies, tracking cookies, and cookie attributes.
 */

const { classifyDomain } = require('./trackerDatabase');

/**
 * Analyze all cookies after page navigation
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} targetDomain - The domain being scanned (for first/third party classification)
 * @param {Array} setCookieHeaders - Collected Set-Cookie headers from network responses
 * @returns {Promise<Object>} Cookie analysis results
 */
async function analyzeCookies(page, targetDomain, setCookieHeaders = []) {
  // Get all cookies from the browser
  const cookies = await page.cookies();

  const analyzed = cookies.map((cookie) => {
    const isFirstParty = isFirstPartyCookie(cookie.domain, targetDomain);
    const trackerInfo = classifyDomain(cookie.domain);
    const expiryInfo = getCookieExpiry(cookie);

    return {
      name: cookie.name,
      value: truncateValue(cookie.value),
      domain: cookie.domain,
      path: cookie.path,
      isFirstParty,
      isThirdParty: !isFirstParty,
      isTracker: trackerInfo.isTracker,
      trackerName: trackerInfo.name || null,
      trackerCategory: trackerInfo.category || null,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite || 'None',
      expires: expiryInfo.expires,
      expiryLabel: expiryInfo.label,
      isSession: cookie.session || false,
      size: cookie.name.length + cookie.value.length,
      priority: cookie.priority || 'Medium',
    };
  });

  // Build summary
  const firstParty = analyzed.filter((c) => c.isFirstParty);
  const thirdParty = analyzed.filter((c) => c.isThirdParty);
  const trackers = analyzed.filter((c) => c.isTracker);
  const httpOnlyCount = analyzed.filter((c) => c.httpOnly).length;
  const secureCount = analyzed.filter((c) => c.secure).length;
  const sessionCookies = analyzed.filter((c) => c.isSession);
  const persistentCookies = analyzed.filter((c) => !c.isSession);

  return {
    total: analyzed.length,
    firstPartyCount: firstParty.length,
    thirdPartyCount: thirdParty.length,
    trackerCount: trackers.length,
    httpOnlyCount,
    secureCount,
    sessionCount: sessionCookies.length,
    persistentCount: persistentCookies.length,
    totalSize: analyzed.reduce((sum, c) => sum + c.size, 0),
    cookies: analyzed,
    setCookieHeadersCount: setCookieHeaders.length,
    thirdPartyDomains: [...new Set(thirdParty.map((c) => c.domain))],
    trackerNames: [...new Set(trackers.map((c) => c.trackerName).filter(Boolean))],
  };
}

/**
 * Determine if a cookie domain belongs to the first party
 */
function isFirstPartyCookie(cookieDomain, targetDomain) {
  // Remove leading dot from cookie domain
  const cleanCookieDomain = cookieDomain.replace(/^\./, '');
  const cleanTarget = targetDomain.replace(/^\./, '');

  // Check if cookie domain matches or is a parent of the target
  return (
    cleanCookieDomain === cleanTarget ||
    cleanTarget.endsWith('.' + cleanCookieDomain) ||
    cleanCookieDomain.endsWith('.' + cleanTarget)
  );
}

/**
 * Get human-readable cookie expiry information
 */
function getCookieExpiry(cookie) {
  if (cookie.session) {
    return { expires: null, label: 'Session' };
  }

  const expiresDate = new Date(cookie.expires * 1000);
  const now = new Date();
  const diffMs = expiresDate - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label;
  if (diffDays < 1) label = 'Less than a day';
  else if (diffDays < 7) label = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  else if (diffDays < 30) label = `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
  else if (diffDays < 365) label = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;
  else label = `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;

  return { expires: expiresDate.toISOString(), label };
}

/**
 * Truncate long cookie values for display (keep first 100 chars)
 */
function truncateValue(value) {
  if (value && value.length > 100) {
    return value.substring(0, 100) + '…';
  }
  return value;
}

module.exports = { analyzeCookies };
