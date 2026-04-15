/**
 * app.js (Dashboard logic)
 */

document.addEventListener('DOMContentLoaded', () => {
  // === DOM References ===
  const welcomeSection = document.getElementById('welcome-section');
  const resultsContainer = document.getElementById('results-container');
  const errorBanner = document.getElementById('error-banner');
  const errorText = document.getElementById('error-text');
  const loadingOverlay = document.getElementById('loading-overlay');

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

  // Hide the search bar completely in extension mode
  const searchContainer = document.getElementById('search-section');
  if (searchContainer) searchContainer.style.display = 'none';
  welcomeSection.style.display = 'none';
  loadingOverlay.classList.add('active');

  // Load the detailed report
  chrome.runtime.sendMessage({ action: 'GET_FULL_REPORT' }, (response) => {
    loadingOverlay.classList.remove('active');

    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message);
      return;
    }

    if (response && response.error) {
       showError(response.error);
       return;
    }

    if (response && response.report) {
      renderResults(response.report);
    } else {
      showError("Unknown error occurred building report.");
    }
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

  function renderResults(report) {
    // Scan info bar
    scanInfoUrl.textContent = report.scan.url;
    scanInfoMeta.innerHTML = `
      <span>📄 Active Tab</span>
      <span>🕐 ${new Date(report.scan.timestamp).toLocaleTimeString()}</span>
    `;

    // Wait for components.js to be loaded, just in case
    if (typeof renderSummaryCards === 'undefined') {
        setTimeout(() => renderResults(report), 100);
        return;
    }

    // Summary cards
    renderSummaryCards(summaryGrid, report);

    // Privacy score
    renderPrivacyScore(scoreSection, report.privacyScore);

    // Section badges
    cookieBadge.textContent = report.cookies.total || 0;
    networkBadge.textContent = report.network.totalRequests || 0;
    fingerprintBadge.textContent = (report.fingerprinting && report.fingerprinting.categoriesDetected) || 0;
    
    // Safety check for storage body
    let storageTotal = 0;
    if (report.storage && report.storage.localStorage && report.storage.sessionStorage) {
         storageTotal = report.storage.localStorage.itemCount + report.storage.sessionStorage.itemCount;
    }
    storageBadge.textContent = storageTotal;
    
    permissionBadge.textContent = (report.permissions && report.permissions.totalPermissionRequests) || 0;
    extensionBadge.textContent = (report.extensions && report.extensions.totalProbeAttempts) || 0;
    profilingBadge.textContent = (report.profiling && report.profiling.categoriesDetected) || 0;

    // Sections
    renderCookieTable(cookieBody, report.cookies);
    renderNetworkSection(networkBody, report.network);
    renderFingerprintSection(fingerprintBody, report.fingerprinting || {});
    renderStorageSection(storageBody, report.storage || {});
    renderPermissionSection(permissionBody, report.permissions || {});
    renderExtensionSection(extensionBody, report.extensions || {});
    renderProfilingSection(profilingBody, report.profiling || {});

    // Charts
    setTimeout(() => {
      const chartsContainer = document.getElementById('network-charts');
      if (chartsContainer) {
        renderNetworkCharts(chartsContainer, report.network, report.cookies);
      }
    }, 100);

    resultsContainer.classList.add('active');
  }

  function showError(message) {
    if (errorText && errorBanner) {
      errorText.textContent = message;
      errorBanner.classList.add('active');
    }
  }
});
