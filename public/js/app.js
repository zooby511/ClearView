/**
 * app.js
 * Main application logic — handles scan workflow, crawl mode,
 * SSE progress, and coordinates component rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
  // === DOM References ===
  const urlInput = document.getElementById('url-input');
  const scanBtn = document.getElementById('scan-btn');
  const scanBtnText = document.getElementById('scan-btn-text');
  const durationSelect = document.getElementById('duration-select');
  const loadingOverlay = document.getElementById('loading-overlay');
  const welcomeSection = document.getElementById('welcome-section');
  const resultsContainer = document.getElementById('results-container');
  const errorBanner = document.getElementById('error-banner');
  const errorText = document.getElementById('error-text');

  // Crawl-specific DOM
  const crawlToggle = document.getElementById('crawl-toggle');
  const crawlOptions = document.getElementById('crawl-options');
  const maxPagesSelect = document.getElementById('max-pages-select');
  const crawlProgress = document.getElementById('crawl-progress');
  const crawlCounter = document.getElementById('crawl-counter');
  const crawlBarFill = document.getElementById('crawl-bar-fill');
  const crawlCurrentUrl = document.getElementById('crawl-current-url');
  const crawlPagesList = document.getElementById('crawl-pages-list');
  const crawlSummary = document.getElementById('crawl-summary');
  const pageSelector = document.getElementById('page-selector');

  // Results sections
  const scanInfoUrl = document.getElementById('scan-info-url');
  const scanInfoMeta = document.getElementById('scan-info-meta');
  const summaryGrid = document.getElementById('summary-grid');
  const scoreSection = document.getElementById('score-section');
  const cookieBody = document.getElementById('cookie-body');
  const networkBody = document.getElementById('network-body');
  const fingerprintBody = document.getElementById('fingerprint-body');
  const storageBody = document.getElementById('storage-body');
  const permissionBody = document.getElementById('permission-body');
  const extensionBody = document.getElementById('extension-body');
  const profilingBody = document.getElementById('profiling-body');

  // Section badges
  const cookieBadge = document.getElementById('cookie-badge');
  const networkBadge = document.getElementById('network-badge');
  const fingerprintBadge = document.getElementById('fingerprint-badge');
  const storageBadge = document.getElementById('storage-badge');
  const permissionBadge = document.getElementById('permission-badge');
  const extensionBadge = document.getElementById('extension-badge');
  const profilingBadge = document.getElementById('profiling-badge');

  // === Loading Steps ===
  const loadingSteps = [
    document.getElementById('step-launch'),
    document.getElementById('step-navigate'),
    document.getElementById('step-wait'),
    document.getElementById('step-analyze'),
  ];

  // === State ===
  let isScanning = false;
  let crawlReport = null; // Stored crawl report for page switching
  let activePageIndex = 0;
  let sseSource = null;

  // === Crawl Toggle ===
  crawlToggle.addEventListener('change', () => {
    if (crawlToggle.checked) {
      crawlOptions.classList.add('active');
    } else {
      crawlOptions.classList.remove('active');
    }
  });

  // === Event Listeners ===
  scanBtn.addEventListener('click', startScan);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startScan();
  });

  // Section panel toggle
  document.querySelectorAll('.section-panel__header').forEach((header) => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      const toggle = header.querySelector('.section-panel__toggle');
      body.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });
  });

  // === Scan Logic ===
  async function startScan() {
    let url = urlInput.value.trim();
    if (!url) {
      showError('Please enter a URL to scan');
      urlInput.focus();
      return;
    }

    // Auto-prefix https if needed
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const duration = parseInt(durationSelect.value, 10);
    const isCrawl = crawlToggle.checked;
    const maxPages = parseInt(maxPagesSelect.value, 10);

    // Validate URL
    try {
      new URL(url);
    } catch {
      showError('Invalid URL format. Please enter a valid website URL.');
      return;
    }

    if (isScanning) return;
    isScanning = true;

    // UI transitions
    hideError();
    hideResults();
    hideWelcome();
    hideCrawlProgress();
    crawlReport = null;
    activePageIndex = 0;

    scanBtn.disabled = true;

    if (isCrawl) {
      scanBtnText.textContent = 'Crawling…';
      showCrawlProgress();
      startCrawlSSE();
      await runCrawl(url, duration, maxPages);
    } else {
      scanBtnText.textContent = 'Scanning…';
      showLoading();
      animateLoadingSteps(duration);
      await runSingleScan(url, duration);
    }
  }

  // =====================
  // SINGLE PAGE SCAN
  // =====================
  async function runSingleScan(url, duration) {
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, duration }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Scan failed');
      }

      // Hide crawl-specific UI
      crawlSummary.classList.remove('active');
      pageSelector.classList.remove('active');

      renderResults(data);
    } catch (err) {
      showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      hideLoading();
      scanBtn.disabled = false;
      scanBtnText.textContent = 'Scan Website';
      isScanning = false;
    }
  }

  // =====================
  // MULTI-PAGE CRAWL
  // =====================
  async function runCrawl(url, duration, maxPages) {
    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, duration, maxPages }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Crawl failed');
      }

      crawlReport = data;
      activePageIndex = 0;

      // Render the crawl summary
      renderCrawlSummary(crawlSummary, crawlReport);

      // Bind click events on crawl page cards
      crawlSummary.querySelectorAll('.crawl-page-card').forEach((card) => {
        card.addEventListener('click', () => {
          const index = parseInt(card.dataset.pageIndex, 10);
          switchToPage(index);
        });
      });

      // Render page selector
      renderPageSelector(pageSelector, crawlReport, activePageIndex, switchToPage);

      // Render the landing page results
      if (data.pageResults && data.pageResults.length > 0) {
        renderResults(data.pageResults[0]);
      }
    } catch (err) {
      showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      hideCrawlProgress();
      stopCrawlSSE();
      scanBtn.disabled = false;
      scanBtnText.textContent = 'Scan Website';
      isScanning = false;
    }
  }

  // =====================
  // PAGE SWITCHING (crawl mode)
  // =====================
  function switchToPage(pageIndex) {
    if (!crawlReport || !crawlReport.pageResults[pageIndex]) return;

    activePageIndex = pageIndex;

    // Update page selector active state
    renderPageSelector(pageSelector, crawlReport, activePageIndex, switchToPage);

    // Update crawl summary card active states
    crawlSummary.querySelectorAll('.crawl-page-card').forEach((card) => {
      card.classList.toggle('active', parseInt(card.dataset.pageIndex) === pageIndex);
      card.addEventListener('click', () => {
        switchToPage(parseInt(card.dataset.pageIndex, 10));
      });
    });

    // Render the selected page's results
    const pageResult = crawlReport.pageResults[pageIndex];
    renderResults(pageResult);

    // Render new findings banner (if not landing page)
    const newFindings = crawlReport.aggregated?.newFindingsPerPage?.[pageIndex];
    const newFindingsContainer = document.getElementById('new-findings-panel');
    if (newFindingsContainer) {
      renderNewFindings(newFindingsContainer, newFindings, pageIndex);
    }

    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =====================
  // SSE: Crawl Progress
  // =====================
  function startCrawlSSE() {
    stopCrawlSSE();
    sseSource = new EventSource('/api/crawl/progress');

    sseSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleCrawlProgress(data);
      } catch {
        // Ignore parse errors
      }
    };

    sseSource.onerror = () => {
      // SSE errors are expected when the crawl completes
    };
  }

  function stopCrawlSSE() {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
  }

  function handleCrawlProgress(data) {
    switch (data.type) {
      case 'scanning':
        crawlCounter.textContent = `${data.pageIndex + 1} / ${Math.min(data.totalDiscovered, data.maxPages)} pages`;
        crawlBarFill.style.width = `${((data.pageIndex + 1) / data.maxPages) * 100}%`;
        crawlCurrentUrl.textContent = `Scanning: ${data.url}`;

        // Add item to the pages list
        addCrawlPageItem(data.url, 'scanning');
        break;

      case 'page_done':
        crawlCounter.textContent = `${data.pageIndex + 1} / ${Math.min(data.totalDiscovered, data.maxPages)} pages`;

        // Update the last scanning item to done
        updateLastCrawlPageItem('done', data.score, data.grade);
        break;

      case 'page_error':
        updateLastCrawlPageItem('error', null, null, data.error);
        break;

      case 'complete':
        crawlCurrentUrl.textContent = `✅ Crawl complete — ${data.totalPages} pages scanned`;
        crawlBarFill.style.width = '100%';
        break;
    }
  }

  function addCrawlPageItem(url, status) {
    const item = document.createElement('div');
    item.className = `crawl-page-item crawl-page-item--${status}`;
    item.innerHTML = `
      <span class="crawl-page-item__icon">${status === 'scanning' ? '⏳' : '○'}</span>
      <span class="crawl-page-item__url">${escapeHtml(url)}</span>
      <span class="crawl-page-item__score"></span>
    `;
    crawlPagesList.appendChild(item);
    crawlPagesList.scrollTop = crawlPagesList.scrollHeight;
  }

  function updateLastCrawlPageItem(status, score, grade, error) {
    const items = crawlPagesList.querySelectorAll('.crawl-page-item');
    const last = items[items.length - 1];
    if (!last) return;

    last.className = `crawl-page-item crawl-page-item--${status}`;
    const icon = last.querySelector('.crawl-page-item__icon');
    const scoreEl = last.querySelector('.crawl-page-item__score');

    if (status === 'done') {
      icon.textContent = '✅';
      if (score !== null) {
        scoreEl.textContent = `${score} (${grade})`;
        if (score >= 80) scoreEl.style.color = 'var(--green-500)';
        else if (score >= 60) scoreEl.style.color = 'var(--yellow-500)';
        else if (score >= 40) scoreEl.style.color = 'var(--orange-500)';
        else scoreEl.style.color = 'var(--red-500)';
      }
    } else if (status === 'error') {
      icon.textContent = '❌';
      scoreEl.textContent = 'Error';
      scoreEl.style.color = 'var(--red-500)';
    }
  }

  // === Render Results (single page or crawl page) ===
  function renderResults(report) {
    // Scan info bar
    scanInfoUrl.textContent = report.scan.url;
    scanInfoMeta.innerHTML = `
      <span>📄 ${escapeHtml(report.scan.pageTitle)}</span>
      <span>⏱️ ${report.scan.loadTime}ms load</span>
      <span>🕐 ${new Date(report.scan.timestamp).toLocaleTimeString()}</span>
    `;

    // Summary cards
    renderSummaryCards(summaryGrid, report);

    // Privacy score
    renderPrivacyScore(scoreSection, report.privacyScore);

    // Section badges
    cookieBadge.textContent = report.cookies.total;
    networkBadge.textContent = report.network.totalRequests;
    fingerprintBadge.textContent = report.fingerprinting.categoriesDetected;
    storageBadge.textContent =
      report.storage.localStorage.itemCount + report.storage.sessionStorage.itemCount;
    permissionBadge.textContent = report.permissions.totalPermissionRequests;
    extensionBadge.textContent = report.extensions ? report.extensions.totalProbeAttempts : 0;
    profilingBadge.textContent = report.profiling ? report.profiling.categoriesDetected : 0;

    // Sections
    renderCookieTable(cookieBody, report.cookies);
    renderNetworkSection(networkBody, report.network);
    renderFingerprintSection(fingerprintBody, report.fingerprinting);
    renderStorageSection(storageBody, report.storage);
    renderPermissionSection(permissionBody, report.permissions);
    renderExtensionSection(extensionBody, report.extensions);
    renderProfilingSection(profilingBody, report.profiling);

    // New findings (crawl mode only)
    let newFindingsPanel = document.getElementById('new-findings-panel');
    if (!newFindingsPanel) {
      newFindingsPanel = document.createElement('div');
      newFindingsPanel.id = 'new-findings-panel';
      // Insert after scan-info
      const scanInfo = document.querySelector('.scan-info');
      if (scanInfo) scanInfo.after(newFindingsPanel);
    }
    if (crawlReport && crawlReport.aggregated) {
      const newFindings = crawlReport.aggregated.newFindingsPerPage?.[activePageIndex];
      renderNewFindings(newFindingsPanel, newFindings, activePageIndex);
    } else {
      newFindingsPanel.innerHTML = '';
    }

    // Charts (after DOM is populated)
    setTimeout(() => {
      const chartsContainer = document.getElementById('network-charts');
      if (chartsContainer) {
        renderNetworkCharts(chartsContainer, report.network, report.cookies);
      }
    }, 100);

    showResults();
  }

  // === Loading animation ===
  function animateLoadingSteps(duration) {
    const delays = [0, 2000, 4000, (duration + 4) * 1000];
    const doneDelays = [1800, 3800, (duration + 3.5) * 1000, null];

    loadingSteps.forEach((step, i) => {
      step.className = 'loading-step';
      setTimeout(() => {
        step.classList.add('active');
        step.querySelector('.loading-step__icon').textContent = '⏳';
      }, delays[i]);

      if (doneDelays[i]) {
        setTimeout(() => {
          step.classList.remove('active');
          step.classList.add('done');
          step.querySelector('.loading-step__icon').textContent = '✅';
        }, doneDelays[i]);
      }
    });
  }

  // === UI State Helpers ===
  function showLoading() {
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
    loadingSteps.forEach((step) => {
      step.className = 'loading-step';
      step.querySelector('.loading-step__icon').textContent = '○';
    });
  }

  function showCrawlProgress() {
    crawlProgress.classList.add('active');
    crawlBarFill.style.width = '0%';
    crawlPagesList.innerHTML = '';
    crawlCurrentUrl.textContent = 'Launching browser...';
    crawlCounter.textContent = '0 / 0 pages';
  }

  function hideCrawlProgress() {
    crawlProgress.classList.remove('active');
  }

  function showResults() {
    resultsContainer.classList.add('active');
  }

  function hideResults() {
    resultsContainer.classList.remove('active');
    crawlSummary.classList.remove('active');
    pageSelector.classList.remove('active');
  }

  function showWelcome() {
    welcomeSection.style.display = 'block';
  }

  function hideWelcome() {
    welcomeSection.style.display = 'none';
  }

  function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.add('active');
  }

  function hideError() {
    errorBanner.classList.remove('active');
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
});
