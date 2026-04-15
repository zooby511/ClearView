/**
 * crawlAnalyzer.js
 * Multi-page crawler — discovers internal links and manages the crawl queue.
 *
 * Features:
 * - BFS link discovery (breadth-first)
 * - URL normalization & deduplication
 * - Configurable maxPages and maxDepth
 * - Filters out non-HTML resources (images, PDFs, etc.)
 */

// Extensions / patterns to skip
const SKIP_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.gz', '.tar', '.7z',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.ogg', '.flac',
  '.css', '.js', '.json', '.xml', '.rss', '.atom',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dmg', '.apk', '.msi',
]);

const SKIP_PREFIXES = ['mailto:', 'tel:', 'javascript:', 'data:', 'blob:', 'ftp:'];

/**
 * Normalize a URL for deduplication
 * - Remove fragment (#...)
 * - Remove trailing slash
 * - Sort query parameters
 * - Lowercase hostname
 */
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = '';
    // Sort search params
    const params = new URLSearchParams(url.searchParams);
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    url.search = sortedParams.toString();
    // Remove trailing slash from pathname (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Check if a URL should be skipped
 */
function shouldSkipUrl(urlString) {
  const lower = urlString.toLowerCase();

  // Skip known non-HTML extensions
  for (const ext of SKIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  // Skip non-http protocols
  for (const prefix of SKIP_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Extract same-domain links from a page
 * @param {import('puppeteer').Page} page
 * @param {string} targetDomain - The primary domain to match (e.g., 'reddit.com')
 * @returns {Promise<string[]>} Array of normalized, deduplicated same-domain URLs
 */
async function extractLinks(page, targetDomain) {
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    return Array.from(anchors).map((a) => {
      try {
        // Use the browser's URL resolution
        return a.href;
      } catch {
        return null;
      }
    }).filter(Boolean);
  });

  const seen = new Set();
  const results = [];

  for (const link of links) {
    try {
      const url = new URL(link);

      // Must be same domain (or subdomain)
      const linkDomain = url.hostname.toLowerCase();
      const baseDomain = targetDomain.toLowerCase();

      // Match exact domain or subdomain (e.g., www.reddit.com matches reddit.com)
      if (linkDomain !== baseDomain && !linkDomain.endsWith('.' + baseDomain)) {
        continue;
      }

      // Must be HTTP/HTTPS
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        continue;
      }

      // Skip non-page resources
      if (shouldSkipUrl(url.href)) {
        continue;
      }

      const normalized = normalizeUrl(url.href);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        results.push(normalized);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return results;
}

/**
 * Manages a BFS crawl queue
 */
class CrawlQueue {
  constructor(startUrl, maxPages, maxDepth) {
    this.maxPages = maxPages;
    this.maxDepth = maxDepth;
    this.visited = new Set();
    this.queue = []; // { url, depth }
    this.results = []; // Ordered list of URLs to scan

    const normalized = normalizeUrl(startUrl);
    if (normalized) {
      this.visited.add(normalized);
      this.results.push({ url: normalized, depth: 0 });
    }
  }

  /**
   * Add discovered links from a page at a given depth
   * @param {string[]} links - Array of URLs found on the page
   * @param {number} currentDepth - Depth of the page these links were found on
   * @returns {number} Number of new links added
   */
  addLinks(links, currentDepth) {
    if (currentDepth >= this.maxDepth) return 0;

    let added = 0;
    const nextDepth = currentDepth + 1;

    for (const link of links) {
      if (this.results.length + this.queue.length >= this.maxPages) break;

      const normalized = normalizeUrl(link);
      if (!normalized) continue;

      if (!this.visited.has(normalized)) {
        this.visited.add(normalized);
        this.queue.push({ url: normalized, depth: nextDepth });
        added++;
      }
    }

    return added;
  }

  /**
   * Get the next URL to crawl
   * @returns {{ url: string, depth: number } | null}
   */
  next() {
    if (this.results.length >= this.maxPages) return null;

    const item = this.queue.shift();
    if (!item) return null;

    this.results.push(item);
    return item;
  }

  /**
   * Total pages discovered (visited + queued)
   */
  get totalDiscovered() {
    return this.results.length + this.queue.length;
  }

  /**
   * Pages scanned so far
   */
  get scannedCount() {
    return this.results.length;
  }

  /**
   * Whether there are more pages to scan
   */
  get hasMore() {
    return this.queue.length > 0 && this.results.length < this.maxPages;
  }
}

/**
 * Aggregate results from multiple page scans into a unified report
 * @param {Array<Object>} pageResults - Array of individual page scan results
 * @returns {Object} Aggregated crawl report
 */
function aggregateResults(pageResults) {
  const aggregated = {
    totalPages: pageResults.length,
    pages: [],
    // Aggregated unique cookies
    allCookies: new Map(),
    // Aggregated unique tracker domains
    allTrackerDomains: new Map(),
    // Aggregated unique third-party domains
    allThirdPartyDomains: new Map(),
    // Aggregated fingerprint categories
    allFingerprintCategories: new Map(),
    // Aggregated profiling categories
    allProfilingCategories: new Map(),
    // Total unique network requests across all pages
    totalNetworkRequests: 0,
    // New findings per page
    newFindingsPerPage: [],
  };

  // Track what was found on the first (landing) page
  const landingCookies = new Set();
  const landingTrackers = new Set();
  const landingThirdParty = new Set();
  const landingFingerprints = new Set();
  const landingProfiling = new Set();

  pageResults.forEach((result, index) => {
    const pageSummary = {
      url: result.scan.url,
      pageTitle: result.scan.pageTitle,
      depth: result.scan.depth || 0,
      privacyScore: result.privacyScore,
      cookieCount: result.cookies.total,
      trackerCount: result.network.trackerDomainCount,
      thirdPartyCount: result.network.thirdPartyDomainCount,
      fingerprintCategories: result.fingerprinting.categoriesDetected,
      profilingVectors: result.profiling ? result.profiling.categoriesDetected : 0,
    };
    aggregated.pages.push(pageSummary);

    // Track new findings for this page (compared to landing page)
    const newFindings = {
      url: result.scan.url,
      pageTitle: result.scan.pageTitle,
      newCookies: [],
      newTrackers: [],
      newThirdParty: [],
      newFingerprints: [],
      newProfiling: [],
    };

    // Cookies
    if (result.cookies.cookies) {
      result.cookies.cookies.forEach((cookie) => {
        const key = cookie.domain + '::' + cookie.name;
        if (!aggregated.allCookies.has(key)) {
          aggregated.allCookies.set(key, {
            ...cookie,
            foundOnPages: [result.scan.url],
          });
        } else {
          aggregated.allCookies.get(key).foundOnPages.push(result.scan.url);
        }

        if (index === 0) {
          landingCookies.add(key);
        } else if (!landingCookies.has(key)) {
          newFindings.newCookies.push(cookie);
        }
      });
    }

    // Tracker domains
    if (result.network.trackerDomains) {
      result.network.trackerDomains.forEach((td) => {
        if (!aggregated.allTrackerDomains.has(td.domain)) {
          aggregated.allTrackerDomains.set(td.domain, {
            ...td,
            foundOnPages: [result.scan.url],
          });
        } else {
          aggregated.allTrackerDomains.get(td.domain).foundOnPages.push(result.scan.url);
        }

        if (index === 0) {
          landingTrackers.add(td.domain);
        } else if (!landingTrackers.has(td.domain)) {
          newFindings.newTrackers.push(td);
        }
      });
    }

    // Third-party domains
    if (result.network.thirdPartyDomains) {
      result.network.thirdPartyDomains.forEach((tp) => {
        if (!aggregated.allThirdPartyDomains.has(tp.domain)) {
          aggregated.allThirdPartyDomains.set(tp.domain, {
            ...tp,
            foundOnPages: [result.scan.url],
          });
        } else {
          aggregated.allThirdPartyDomains.get(tp.domain).foundOnPages.push(result.scan.url);
        }

        if (index === 0) {
          landingThirdParty.add(tp.domain);
        } else if (!landingThirdParty.has(tp.domain)) {
          newFindings.newThirdParty.push(tp);
        }
      });
    }

    // Fingerprint categories
    if (result.fingerprinting.categories) {
      result.fingerprinting.categories.forEach((cat) => {
        if (!aggregated.allFingerprintCategories.has(cat.category)) {
          aggregated.allFingerprintCategories.set(cat.category, {
            ...cat,
            foundOnPages: [result.scan.url],
          });
        } else {
          aggregated.allFingerprintCategories.get(cat.category).foundOnPages.push(result.scan.url);
        }

        if (index === 0) {
          landingFingerprints.add(cat.category);
        } else if (!landingFingerprints.has(cat.category)) {
          newFindings.newFingerprints.push(cat);
        }
      });
    }

    // Profiling categories
    if (result.profiling && result.profiling.categories) {
      result.profiling.categories.forEach((cat) => {
        if (!aggregated.allProfilingCategories.has(cat.category)) {
          aggregated.allProfilingCategories.set(cat.category, {
            ...cat,
            foundOnPages: [result.scan.url],
          });
        } else {
          aggregated.allProfilingCategories.get(cat.category).foundOnPages.push(result.scan.url);
        }

        if (index === 0) {
          landingProfiling.add(cat.category);
        } else if (!landingProfiling.has(cat.category)) {
          newFindings.newProfiling.push(cat);
        }
      });
    }

    aggregated.totalNetworkRequests += result.network.totalRequests || 0;
    aggregated.newFindingsPerPage.push(newFindings);
  });

  // Convert Maps to arrays for JSON serialization
  return {
    totalPages: aggregated.totalPages,
    pages: aggregated.pages,
    totalNetworkRequests: aggregated.totalNetworkRequests,
    uniqueCookies: aggregated.allCookies.size,
    uniqueTrackerDomains: aggregated.allTrackerDomains.size,
    uniqueThirdPartyDomains: aggregated.allThirdPartyDomains.size,
    uniqueFingerprintCategories: aggregated.allFingerprintCategories.size,
    uniqueProfilingCategories: aggregated.allProfilingCategories.size,
    allCookies: Array.from(aggregated.allCookies.values()),
    allTrackerDomains: Array.from(aggregated.allTrackerDomains.values()),
    allThirdPartyDomains: Array.from(aggregated.allThirdPartyDomains.values()),
    allFingerprintCategories: Array.from(aggregated.allFingerprintCategories.values()),
    allProfilingCategories: Array.from(aggregated.allProfilingCategories.values()),
    newFindingsPerPage: aggregated.newFindingsPerPage,
    // Count pages that introduced new findings
    pagesWithNewFindings: aggregated.newFindingsPerPage.filter(
      (p) =>
        p.newCookies.length > 0 ||
        p.newTrackers.length > 0 ||
        p.newThirdParty.length > 0 ||
        p.newFingerprints.length > 0 ||
        p.newProfiling.length > 0
    ).length,
  };
}

module.exports = { extractLinks, CrawlQueue, aggregateResults, normalizeUrl };
