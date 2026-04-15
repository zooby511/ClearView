/**
 * server.js
 * Express server that orchestrates website data collection analysis.
 * Provides REST API and serves the dashboard frontend.
 * Supports both single-page scans and multi-page crawls.
 */

const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');

const { analyzeCookies } = require('./analyzers/cookieAnalyzer');
const { analyzeStorage } = require('./analyzers/storageAnalyzer');
const { createNetworkMonitor } = require('./analyzers/networkAnalyzer');
const {
  getFingerprintInjectionScript,
  collectFingerprintResults,
} = require('./analyzers/fingerprintAnalyzer');
const {
  getPermissionInjectionScript,
  collectPermissionResults,
} = require('./analyzers/permissionAnalyzer');
const {
  getExtensionInjectionScript,
  collectExtensionResults,
} = require('./analyzers/extensionAnalyzer');
const {
  getProfilingInjectionScript,
  collectProfilingResults,
} = require('./analyzers/profilingAnalyzer');
const {
  extractLinks,
  CrawlQueue,
  aggregateResults,
} = require('./analyzers/crawlAnalyzer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track active scans
let activeScan = null;

// SSE clients for crawl progress
let crawlProgressClients = [];

// ================================================================
// REUSABLE: Scan a single page using an existing browser instance
// ================================================================
async function scanSinglePage(browser, targetUrl, duration, targetDomain) {
  const page = await browser.newPage();

  try {
    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Create CDP session for low-level network monitoring
    const cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');

    // Set up network monitor
    const networkMonitor = createNetworkMonitor(cdpSession, targetDomain);

    // Inject all monitoring scripts BEFORE page loads
    await page.evaluateOnNewDocument(getFingerprintInjectionScript());
    await page.evaluateOnNewDocument(getPermissionInjectionScript());
    await page.evaluateOnNewDocument(getExtensionInjectionScript());
    await page.evaluateOnNewDocument(getProfilingInjectionScript());

    // Navigate to the page
    const startTime = Date.now();
    let pageError = null;

    try {
      await page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
    } catch (navError) {
      pageError = navError.message;
    }

    const loadTime = Date.now() - startTime;

    // Wait for async scripts to fire
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));

    // Get the page title
    let pageTitle = '';
    try {
      pageTitle = await page.title();
    } catch {
      pageTitle = 'Unknown';
    }

    // Collect all data
    const networkResults = networkMonitor.getResults();
    const setCookieHeaders = networkMonitor.getSetCookieHeaders();
    const cookieResults = await analyzeCookies(page, targetDomain, setCookieHeaders);
    const storageResults = await analyzeStorage(page);
    const fingerprintResults = await collectFingerprintResults(page);
    const permissionResults = await collectPermissionResults(page);
    const extensionResults = await collectExtensionResults(page);
    const profilingResults = await collectProfilingResults(page);

    // Extract same-domain links (for crawl mode)
    let discoveredLinks = [];
    try {
      discoveredLinks = await extractLinks(page, targetDomain);
    } catch {
      // Link extraction is optional
    }

    // Calculate privacy score
    const privacyScore = calculatePrivacyScore({
      cookies: cookieResults,
      network: networkResults,
      fingerprint: fingerprintResults,
      permissions: permissionResults,
      extensions: extensionResults,
      profiling: profilingResults,
    });

    return {
      scan: {
        url: targetUrl,
        domain: targetDomain,
        pageTitle,
        scanDuration: duration,
        loadTime,
        timestamp: new Date().toISOString(),
        pageError,
      },
      privacyScore,
      cookies: cookieResults,
      storage: storageResults,
      network: networkResults,
      fingerprinting: fingerprintResults,
      permissions: permissionResults,
      extensions: extensionResults,
      profiling: profilingResults,
      discoveredLinks,
    };
  } finally {
    await page.close();
  }
}

// ================================================================
// POST /api/scan — Single-page scan
// ================================================================
app.post('/api/scan', async (req, res) => {
  const { url, duration = 10 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (activeScan) {
    return res.status(409).json({ error: 'A scan is already in progress. Please wait.' });
  }

  activeScan = targetUrl.href;
  console.log(`\n🔍 Starting scan: ${targetUrl.href} (duration: ${duration}s)`);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content',
      ],
    });

    console.log('  📡 Navigating to page...');
    const report = await scanSinglePage(browser, targetUrl.href, duration, targetUrl.hostname);

    // Remove discoveredLinks from single-page scan response (not needed)
    delete report.discoveredLinks;

    console.log(`  🏁 Scan complete! Privacy Score: ${report.privacyScore.score}/100 (${report.privacyScore.grade})\n`);
    res.json(report);
  } catch (error) {
    console.error('  ❌ Scan error:', error.message);
    res.status(500).json({
      error: 'Scan failed',
      message: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
    activeScan = null;
  }
});

// ================================================================
// POST /api/crawl — Multi-page crawl
// ================================================================
app.post('/api/crawl', async (req, res) => {
  const { url, duration = 5, maxPages = 10, maxDepth = 2 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (activeScan) {
    return res.status(409).json({ error: 'A scan is already in progress. Please wait.' });
  }

  activeScan = targetUrl.href;
  const targetDomain = targetUrl.hostname;
  const cappedMaxPages = Math.min(maxPages, 20);
  const cappedMaxDepth = Math.min(maxDepth, 3);

  console.log(`\n🕷️  Starting crawl: ${targetUrl.href} (maxPages: ${cappedMaxPages}, depth: ${cappedMaxDepth}, duration: ${duration}s per page)`);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content',
      ],
    });

    const crawlQueue = new CrawlQueue(targetUrl.href, cappedMaxPages, cappedMaxDepth);
    const pageResults = [];

    // Scan the landing page first
    console.log(`  [1/${cappedMaxPages}] Scanning landing page: ${targetUrl.href}`);
    sendCrawlProgress({
      type: 'scanning',
      pageIndex: 0,
      totalDiscovered: 1,
      maxPages: cappedMaxPages,
      url: targetUrl.href,
      status: 'scanning',
    });

    const landingResult = await scanSinglePage(browser, targetUrl.href, duration, targetDomain);
    landingResult.scan.depth = 0;
    pageResults.push(landingResult);

    console.log(`  ✅ Landing page: Score ${landingResult.privacyScore.score}/100, found ${landingResult.discoveredLinks.length} internal links`);
    sendCrawlProgress({
      type: 'page_done',
      pageIndex: 0,
      totalDiscovered: crawlQueue.totalDiscovered,
      maxPages: cappedMaxPages,
      url: targetUrl.href,
      score: landingResult.privacyScore.score,
      grade: landingResult.privacyScore.grade,
    });

    // Add discovered links to the queue
    crawlQueue.addLinks(landingResult.discoveredLinks, 0);

    // Crawl remaining pages
    while (crawlQueue.hasMore) {
      const next = crawlQueue.next();
      if (!next) break;

      const pageIndex = pageResults.length;
      console.log(`  [${pageIndex + 1}/${cappedMaxPages}] Scanning: ${next.url} (depth: ${next.depth})`);

      sendCrawlProgress({
        type: 'scanning',
        pageIndex,
        totalDiscovered: crawlQueue.totalDiscovered,
        maxPages: cappedMaxPages,
        url: next.url,
        status: 'scanning',
      });

      try {
        const pageResult = await scanSinglePage(browser, next.url, duration, targetDomain);
        pageResult.scan.depth = next.depth;
        pageResults.push(pageResult);

        // Add newly discovered links
        crawlQueue.addLinks(pageResult.discoveredLinks, next.depth);

        console.log(`  ✅ Score: ${pageResult.privacyScore.score}/100`);
        sendCrawlProgress({
          type: 'page_done',
          pageIndex,
          totalDiscovered: crawlQueue.totalDiscovered,
          maxPages: cappedMaxPages,
          url: next.url,
          score: pageResult.privacyScore.score,
          grade: pageResult.privacyScore.grade,
        });
      } catch (err) {
        console.log(`  ⚠️  Failed to scan: ${next.url} — ${err.message}`);
        sendCrawlProgress({
          type: 'page_error',
          pageIndex,
          totalDiscovered: crawlQueue.totalDiscovered,
          maxPages: cappedMaxPages,
          url: next.url,
          error: err.message,
        });
      }
    }

    // Aggregate results
    const aggregated = aggregateResults(pageResults);

    // Clean up discoveredLinks from individual results (large, not needed in response)
    pageResults.forEach((r) => delete r.discoveredLinks);

    // Calculate overall crawl privacy score (worst page score)
    const worstScore = Math.min(...pageResults.map((r) => r.privacyScore.score));
    const worstGrade = pageResults.find((r) => r.privacyScore.score === worstScore)?.privacyScore.grade || 'F';

    const crawlReport = {
      crawl: {
        url: targetUrl.href,
        domain: targetDomain,
        maxPages: cappedMaxPages,
        maxDepth: cappedMaxDepth,
        durationPerPage: duration,
        totalPagesScanned: pageResults.length,
        timestamp: new Date().toISOString(),
      },
      overallScore: {
        score: worstScore,
        grade: worstGrade,
        label: 'Worst page score across all crawled pages',
      },
      aggregated,
      pageResults,
    };

    console.log(`  🏁 Crawl complete! ${pageResults.length} pages scanned. Worst score: ${worstScore}/100 (${worstGrade})\n`);

    sendCrawlProgress({
      type: 'complete',
      totalPages: pageResults.length,
    });

    res.json(crawlReport);
  } catch (error) {
    console.error('  ❌ Crawl error:', error.message);
    sendCrawlProgress({
      type: 'error',
      error: error.message,
    });
    res.status(500).json({
      error: 'Crawl failed',
      message: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
    activeScan = null;
  }
});

// ================================================================
// SSE: Crawl progress stream
// ================================================================
app.get('/api/crawl/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write('data: {"type":"connected"}\n\n');

  crawlProgressClients.push(res);

  req.on('close', () => {
    crawlProgressClients = crawlProgressClients.filter((c) => c !== res);
  });
});

function sendCrawlProgress(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  crawlProgressClients.forEach((client) => {
    try {
      client.write(message);
    } catch {
      // Client disconnected
    }
  });
}

// ================================================================
// GET /api/status
// ================================================================
app.get('/api/status', (req, res) => {
  res.json({
    scanning: !!activeScan,
    currentUrl: activeScan,
  });
});

// ================================================================
// Privacy Score Calculation
// ================================================================
function calculatePrivacyScore({ cookies, network, fingerprint, permissions, extensions, profiling }) {
  let score = 100;
  const deductions = [];

  // Third-party cookies (up to -20)
  if (cookies.thirdPartyCount > 0) {
    const deduction = Math.min(20, cookies.thirdPartyCount * 2);
    score -= deduction;
    deductions.push({
      category: 'Third-Party Cookies',
      points: -deduction,
      detail: `${cookies.thirdPartyCount} third-party cookies found`,
    });
  }

  // Tracker cookies (up to -15)
  if (cookies.trackerCount > 0) {
    const deduction = Math.min(15, cookies.trackerCount * 3);
    score -= deduction;
    deductions.push({
      category: 'Tracker Cookies',
      points: -deduction,
      detail: `${cookies.trackerCount} tracking cookies identified`,
    });
  }

  // Third-party requests (up to -15)
  if (network.thirdPartyDomainCount > 5) {
    const deduction = Math.min(15, (network.thirdPartyDomainCount - 5) * 2);
    score -= deduction;
    deductions.push({
      category: 'Third-Party Domains',
      points: -deduction,
      detail: `${network.thirdPartyDomainCount} third-party domains contacted`,
    });
  }

  // Tracker domains (up to -20)
  if (network.trackerDomainCount > 0) {
    const deduction = Math.min(20, network.trackerDomainCount * 4);
    score -= deduction;
    deductions.push({
      category: 'Tracking Domains',
      points: -deduction,
      detail: `${network.trackerDomainCount} known tracker domains detected`,
    });
  }

  // Fingerprinting (use fingerprint risk score, up to -20)
  if (fingerprint.riskScore > 0) {
    const deduction = Math.min(20, Math.round(fingerprint.riskScore * 0.2));
    score -= deduction;
    deductions.push({
      category: 'Browser Fingerprinting',
      points: -deduction,
      detail: `Fingerprint risk score: ${fingerprint.riskScore}/100`,
    });
  }

  // Permission requests (up to -10)
  const highRiskPerms = permissions.highRiskPermissions?.length || 0;
  if (highRiskPerms > 0) {
    const deduction = Math.min(10, highRiskPerms * 5);
    score -= deduction;
    deductions.push({
      category: 'Sensitive Permissions',
      points: -deduction,
      detail: `${highRiskPerms} high-risk permission requests`,
    });
  }

  // Extension probing (up to -10)
  if (extensions && extensions.knownExtensionsProbed > 0) {
    const deduction = Math.min(10, extensions.knownExtensionsProbed * 2);
    score -= deduction;
    deductions.push({
      category: 'Extension Fingerprinting',
      points: -deduction,
      detail: `${extensions.knownExtensionsProbed} known extensions probed`,
    });
  }

  // User profiling (up to -15)
  if (profiling && profiling.intensityScore > 10) {
    const deduction = Math.min(15, Math.round(profiling.intensityScore * 0.15));
    score -= deduction;
    deductions.push({
      category: 'User Profiling',
      points: -deduction,
      detail: `Profiling intensity: ${profiling.intensityLevel} (${profiling.intensityScore}/100)`,
    });
  }

  score = Math.max(0, Math.min(100, score));

  let grade;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return { score, grade, deductions };
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🔒 Chrome Website Data Analyzer                    ║
║   Dashboard: http://localhost:${PORT}                   ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});
