/**
 * networkAnalyzer.js
 * Monitors all network requests made by a page.
 * Classifies requests by type, domain, and tracker status.
 */

const { classifyUrl, classifyDomain } = require('./trackerDatabase');

/**
 * Create a network monitor that attaches to a CDP session
 * @param {import('puppeteer').CDPSession} cdpSession - Chrome DevTools Protocol session
 * @param {string} targetDomain - The primary domain being scanned
 * @returns {Object} Monitor object with getResults() method
 */
function createNetworkMonitor(cdpSession, targetDomain) {
  const requests = [];
  const setCookieHeaders = [];
  const beaconCalls = [];

  // Listen for all requests
  cdpSession.on('Network.requestWillBeSent', (params) => {
    const { requestId, request, type, initiator } = params;
    let hostname = '';
    try {
      hostname = new URL(request.url).hostname;
    } catch {
      // invalid URL
    }

    const trackerInfo = classifyUrl(request.url);
    const isThirdParty = hostname && !isFirstPartyDomain(hostname, targetDomain);

    requests.push({
      id: requestId,
      url: request.url,
      method: request.method,
      type: type || 'Other',
      hostname,
      isThirdParty,
      isTracker: trackerInfo.isTracker,
      trackerName: trackerInfo.name || null,
      trackerCategory: trackerInfo.category || null,
      initiator: initiator?.type || 'other',
      initiatorUrl: initiator?.url || null,
      timestamp: params.timestamp,
      hasPostData: !!request.postData,
      postDataLength: request.postData ? request.postData.length : 0,
      headers: summarizeHeaders(request.headers),
      status: null, // filled in on response
      responseSize: null,
    });
  });

  // Listen for responses to capture Set-Cookie headers and status codes
  cdpSession.on('Network.responseReceived', (params) => {
    const { requestId, response } = params;
    const req = requests.find((r) => r.id === requestId);
    if (req) {
      req.status = response.status;
      req.responseSize = response.encodedDataLength || 0;
      req.mimeType = response.mimeType || '';
    }

    // Capture Set-Cookie headers
    const headers = response.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        setCookieHeaders.push({
          url: response.url,
          value: value,
          requestId,
        });
      }
    }
  });

  return {
    getResults() {
      // Domain analysis
      const domainMap = {};
      requests.forEach((req) => {
        if (!req.hostname) return;
        if (!domainMap[req.hostname]) {
          const trackerInfo = classifyDomain(req.hostname);
          domainMap[req.hostname] = {
            domain: req.hostname,
            requestCount: 0,
            isThirdParty: req.isThirdParty,
            isTracker: trackerInfo.isTracker,
            trackerName: trackerInfo.name || null,
            trackerCategory: trackerInfo.category || null,
            types: {},
            totalSize: 0,
          };
        }
        domainMap[req.hostname].requestCount++;
        domainMap[req.hostname].types[req.type] =
          (domainMap[req.hostname].types[req.type] || 0) + 1;
        domainMap[req.hostname].totalSize += req.responseSize || 0;
      });

      // Type breakdown
      const typeBreakdown = {};
      requests.forEach((req) => {
        typeBreakdown[req.type] = (typeBreakdown[req.type] || 0) + 1;
      });

      const domains = Object.values(domainMap).sort(
        (a, b) => b.requestCount - a.requestCount
      );
      const thirdPartyDomains = domains.filter((d) => d.isThirdParty);
      const trackerDomains = domains.filter((d) => d.isTracker);
      const thirdPartyRequests = requests.filter((r) => r.isThirdParty);
      const trackerRequests = requests.filter((r) => r.isTracker);

      return {
        totalRequests: requests.length,
        thirdPartyRequestCount: thirdPartyRequests.length,
        trackerRequestCount: trackerRequests.length,
        totalDomains: domains.length,
        thirdPartyDomainCount: thirdPartyDomains.length,
        trackerDomainCount: trackerDomains.length,
        typeBreakdown,
        domains,
        thirdPartyDomains,
        trackerDomains,
        requests: requests.map((r) => ({
          url: truncateUrl(r.url),
          fullUrl: r.url,
          method: r.method,
          type: r.type,
          hostname: r.hostname,
          isThirdParty: r.isThirdParty,
          isTracker: r.isTracker,
          trackerName: r.trackerName,
          trackerCategory: r.trackerCategory,
          status: r.status,
          responseSize: r.responseSize,
          mimeType: r.mimeType,
          initiator: r.initiator,
        })),
        setCookieHeaders,
        totalDataTransferred: requests.reduce(
          (sum, r) => sum + (r.responseSize || 0),
          0
        ),
        totalDataTransferredFormatted: formatBytes(
          requests.reduce((sum, r) => sum + (r.responseSize || 0), 0)
        ),
      };
    },
    getSetCookieHeaders() {
      return setCookieHeaders;
    },
  };
}

/**
 * Check if a domain belongs to the first party site
 */
function isFirstPartyDomain(domain, targetDomain) {
  const cleanDomain = domain.replace(/^www\./, '');
  const cleanTarget = targetDomain.replace(/^www\./, '');
  return (
    cleanDomain === cleanTarget ||
    cleanDomain.endsWith('.' + cleanTarget) ||
    cleanTarget.endsWith('.' + cleanDomain)
  );
}

/**
 * Extract interesting headers for display
 */
function summarizeHeaders(headers) {
  const interesting = [
    'referer',
    'origin',
    'cookie',
    'authorization',
    'x-requested-with',
  ];
  const summary = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (interesting.includes(key.toLowerCase())) {
      summary[key] = value.length > 100 ? value.substring(0, 100) + '…' : value;
    }
  }
  return summary;
}

/**
 * Truncate URL for display
 */
function truncateUrl(url) {
  if (url && url.length > 120) {
    return url.substring(0, 120) + '…';
  }
  return url;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { createNetworkMonitor };
