/**
 * components.js
 * UI component renderers for the dashboard.
 * Each function takes data and returns HTML strings or directly manipulates the DOM.
 */

// ==========================================
// SUMMARY CARDS
// ==========================================
function renderSummaryCards(container, report) {
  const { cookies, network, fingerprinting, storage, permissions, extensions, profiling } = report;

  const cards = [
    {
      icon: '🍪',
      value: cookies.total,
      label: 'Total Cookies',
      color: '--yellow-500',
    },
    {
      icon: '👁️',
      value: network.trackerDomainCount,
      label: 'Tracker Domains',
      color: '--red-500',
    },
    {
      icon: '🌐',
      value: network.thirdPartyDomainCount,
      label: 'Third-Party Domains',
      color: '--orange-500',
    },
    {
      icon: '🔍',
      value: fingerprinting.categoriesDetected,
      label: 'Fingerprint Vectors',
      color: '--purple-500',
    },
    {
      icon: '📡',
      value: network.totalRequests,
      label: 'Network Requests',
      color: '--cyan-500',
    },
    {
      icon: '💾',
      value: storage.totalStorageSizeFormatted,
      label: 'Data Stored Locally',
      color: '--green-500',
    },
    {
      icon: '🧩',
      value: extensions ? extensions.totalProbeAttempts : 0,
      label: 'Extension Probes',
      color: '--pink-500',
    },
    {
      icon: '👤',
      value: profiling ? profiling.categoriesDetected : 0,
      label: 'Profiling Vectors',
      color: '--orange-500',
    },
  ];

  container.innerHTML = cards
    .map(
      (card) => `
    <div class="summary-card">
      <span class="summary-card__icon">${card.icon}</span>
      <div class="summary-card__value" style="color: var(${card.color})">${card.value}</div>
      <div class="summary-card__label">${card.label}</div>
    </div>
  `
    )
    .join('');
}

// ==========================================
// PRIVACY SCORE
// ==========================================
function renderPrivacyScore(container, privacyScore) {
  const { score, grade, deductions } = privacyScore;

  let scoreColor;
  if (score >= 80) scoreColor = 'var(--green-500)';
  else if (score >= 60) scoreColor = 'var(--yellow-500)';
  else if (score >= 40) scoreColor = 'var(--orange-500)';
  else scoreColor = 'var(--red-500)';

  // SVG circle math
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  container.innerHTML = `
    <div class="score-card">
      <div class="score-ring">
        <svg viewBox="0 0 160 160">
          <circle class="score-ring__bg" cx="80" cy="80" r="${radius}" />
          <circle class="score-ring__fill" cx="80" cy="80" r="${radius}"
            stroke="${scoreColor}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}" />
        </svg>
        <div class="score-ring__value">
          <div class="score-ring__number" style="color: ${scoreColor}">${score}</div>
          <div class="score-ring__label">/ 100</div>
        </div>
      </div>
      <div class="score-grade" style="color: ${scoreColor}">Grade ${grade}</div>
    </div>

    <div class="score-deductions">
      <div class="score-deductions__title">Privacy Impact Breakdown</div>
      ${
        deductions.length > 0
          ? deductions
              .map(
                (d) => `
        <div class="deduction-item">
          <div>
            <div class="deduction-item__label">${d.category}</div>
            <div class="deduction-item__detail">${d.detail}</div>
          </div>
          <div class="deduction-item__points">${d.points}</div>
        </div>
      `
              )
              .join('')
          : `<div class="empty-state">
            <div class="empty-state__icon">🎉</div>
            <div class="empty-state__text">No privacy issues detected!</div>
          </div>`
      }
    </div>
  `;
}

// ==========================================
// COOKIES TABLE
// ==========================================
function renderCookieTable(container, cookieData) {
  if (!cookieData.cookies || cookieData.cookies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🍪</div>
        <div class="empty-state__text">No cookies found on this page</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Domain</th>
            <th>Type</th>
            <th>Tracker</th>
            <th>Expiry</th>
            <th>Flags</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          ${cookieData.cookies
            .map(
              (c) => `
            <tr>
              <td class="mono truncated" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</td>
              <td class="mono" style="font-size: 12px">${escapeHtml(c.domain)}</td>
              <td>
                <span class="tag ${c.isFirstParty ? 'tag--first-party' : 'tag--third-party'}">
                  ${c.isFirstParty ? '1st Party' : '3rd Party'}
                </span>
              </td>
              <td>
                ${
                  c.isTracker
                    ? `<span class="tag tag--tracker" title="${escapeHtml(c.trackerCategory || '')}">${escapeHtml(c.trackerName)}</span>`
                    : '<span style="color: var(--text-muted)">—</span>'
                }
              </td>
              <td style="font-size: 12px; color: var(--text-muted)">${c.expiryLabel}</td>
              <td>
                ${c.secure ? '<span class="tag tag--secure">Secure</span> ' : ''}
                ${c.httpOnly ? '<span class="tag tag--httponly">HttpOnly</span> ' : ''}
                ${c.sameSite !== 'None' ? `<span class="tag tag--type">${c.sameSite}</span>` : ''}
              </td>
              <td class="mono" style="font-size: 12px">${c.size} B</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==========================================
// NETWORK / DOMAINS
// ==========================================
function renderNetworkSection(container, networkData) {
  const trackerDomains = networkData.trackerDomains || [];
  const thirdPartyDomains = networkData.thirdPartyDomains || [];

  container.innerHTML = `
    <div class="charts-row" id="network-charts"></div>

    ${
      trackerDomains.length > 0
        ? `
      <div class="sub-header">
        🚨 Detected Trackers <span class="sub-header__count">(${trackerDomains.length} domains)</span>
      </div>
      <ul class="domain-list" style="margin-bottom: 24px">
        ${trackerDomains
          .map(
            (d) => `
          <li class="domain-item">
            <div>
              <div class="domain-item__name">${escapeHtml(d.domain)}</div>
              <div style="margin-top: 4px">
                <span class="tag tag--tracker">${escapeHtml(d.trackerName || 'Unknown')}</span>
                <span class="tag tag--category">${escapeHtml(d.trackerCategory || '')}</span>
              </div>
            </div>
            <div class="domain-item__meta">
              <span class="domain-item__count">${d.requestCount} req</span>
            </div>
          </li>
        `
          )
          .join('')}
      </ul>
    `
        : ''
    }

    ${
      thirdPartyDomains.length > 0
        ? `
      <div class="sub-header">
        🌐 All Third-Party Domains <span class="sub-header__count">(${thirdPartyDomains.length} domains)</span>
      </div>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Requests</th>
              <th>Status</th>
              <th>Types</th>
            </tr>
          </thead>
          <tbody>
            ${thirdPartyDomains
              .slice(0, 50)
              .map(
                (d) => `
              <tr>
                <td class="mono">${escapeHtml(d.domain)}</td>
                <td class="mono">${d.requestCount}</td>
                <td>
                  ${d.isTracker ? `<span class="tag tag--tracker">${escapeHtml(d.trackerName)}</span>` : '<span class="tag tag--type">External</span>'}
                </td>
                <td style="font-size: 12px; color: var(--text-muted)">${Object.keys(d.types).join(', ')}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
        : `
      <div class="empty-state">
        <div class="empty-state__icon">🌐</div>
        <div class="empty-state__text">No third-party domains detected</div>
      </div>
    `
    }
  `;
}

// ==========================================
// FINGERPRINTING
// ==========================================
function renderFingerprintSection(container, fpData) {
  if (!fpData.categories || fpData.categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <div class="empty-state__text">No fingerprinting attempts detected</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap">
      <span class="tag ${fpData.riskLevel === 'High' ? 'tag--risk-high' : fpData.riskLevel === 'Medium' ? 'tag--risk-medium' : 'tag--risk-low'}" style="font-size: 13px; padding: 6px 14px">
        Risk: ${fpData.riskLevel} (${fpData.riskScore}/100)
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${fpData.totalApiCalls} total API calls
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${fpData.uniqueApis} unique APIs
      </span>
    </div>

    ${fpData.categories
      .sort((a, b) => {
        const riskOrder = { High: 0, Medium: 1, Low: 2 };
        return (riskOrder[a.riskLevel] || 2) - (riskOrder[b.riskLevel] || 2);
      })
      .map(
        (cat) => `
      <div class="fingerprint-card">
        <div class="fingerprint-card__header">
          <span class="fingerprint-card__category">${escapeHtml(cat.category)}</span>
          <div>
            <span class="tag tag--risk-${cat.riskLevel.toLowerCase()}">${cat.riskLevel} Risk</span>
            <span class="tag tag--type" style="margin-left: 6px">${cat.totalCalls} calls</span>
          </div>
        </div>
        <ul class="fingerprint-card__apis">
          ${cat.apis
            .map(
              (api) => `
            <li class="fingerprint-card__api">
              <span class="fingerprint-card__api-name">${escapeHtml(api.api)}</span>
              <span class="fingerprint-card__api-count">×${api.count}</span>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    `
      )
      .join('')}
  `;
}

// ==========================================
// STORAGE
// ==========================================
function renderStorageSection(container, storageData) {
  const hasLocalStorage = storageData.localStorage.items.length > 0;
  const hasSessionStorage = storageData.sessionStorage.items.length > 0;
  const hasIDB = storageData.indexedDB.databaseCount > 0;

  if (!hasLocalStorage && !hasSessionStorage && !hasIDB) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💾</div>
        <div class="empty-state__text">No web storage data found</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    ${
      hasLocalStorage
        ? `
      <div class="sub-header">
        localStorage <span class="sub-header__count">(${storageData.localStorage.itemCount} items, ${storageData.localStorage.totalSizeFormatted})</span>
      </div>
      <div style="margin-bottom: 24px">
        ${storageData.localStorage.items
          .map(
            (item) => `
          <div class="storage-item">
            <div class="storage-item__key">${escapeHtml(item.key)}</div>
            <div class="storage-item__value" title="${escapeHtml(item.value || '')}">${escapeHtml(item.value || '(empty)')}</div>
            <div>
              <span class="tag tag--type">${item.type}</span>
              <span class="storage-item__size">${formatBytes(item.size)}</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    ${
      hasSessionStorage
        ? `
      <div class="sub-header">
        sessionStorage <span class="sub-header__count">(${storageData.sessionStorage.itemCount} items, ${storageData.sessionStorage.totalSizeFormatted})</span>
      </div>
      <div style="margin-bottom: 24px">
        ${storageData.sessionStorage.items
          .map(
            (item) => `
          <div class="storage-item">
            <div class="storage-item__key">${escapeHtml(item.key)}</div>
            <div class="storage-item__value" title="${escapeHtml(item.value || '')}">${escapeHtml(item.value || '(empty)')}</div>
            <div>
              <span class="tag tag--type">${item.type}</span>
              <span class="storage-item__size">${formatBytes(item.size)}</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    ${
      hasIDB
        ? `
      <div class="sub-header">
        IndexedDB <span class="sub-header__count">(${storageData.indexedDB.databaseCount} databases)</span>
      </div>
      <ul class="domain-list">
        ${storageData.indexedDB.databases
          .map(
            (db) => `
          <li class="domain-item">
            <span class="domain-item__name">${escapeHtml(db.name)}</span>
            <span class="tag tag--type">v${db.version}</span>
          </li>
        `
          )
          .join('')}
      </ul>
    `
        : ''
    }
  `;
}

// ==========================================
// PERMISSIONS
// ==========================================
function renderPermissionSection(container, permData) {
  if (!permData.permissions || permData.permissions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔑</div>
        <div class="empty-state__text">No permission requests detected</div>
      </div>`;
    return;
  }

  container.innerHTML = permData.permissions
    .map(
      (perm) => `
    <div class="permission-item">
      <div class="permission-item__icon">${perm.icon}</div>
      <div class="permission-item__info">
        <div class="permission-item__type">${escapeHtml(perm.type)}</div>
        <div class="permission-item__api">${perm.calls.map((c) => escapeHtml(c.api)).join(', ')}</div>
      </div>
      <div>
        <span class="tag tag--risk-${perm.riskLevel.toLowerCase()}">${perm.riskLevel}</span>
        <span class="tag tag--type" style="margin-left: 6px">×${perm.count}</span>
      </div>
    </div>
  `
    )
    .join('');
}

// ==========================================
// EXTENSION FINGERPRINTING
// ==========================================
function renderExtensionSection(container, extData) {
  if (!extData || extData.totalProbeAttempts === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🧩</div>
        <div class="empty-state__text">No extension probing attempts detected</div>
      </div>`;
    return;
  }

  const probedList = extData.probedExtensions || [];
  const unknownList = extData.unknownProbes || [];

  container.innerHTML = `
    <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap">
      <span class="tag tag--risk-${extData.riskLevel === 'High' ? 'high' : extData.riskLevel === 'Medium' ? 'medium' : 'low'}" style="font-size: 13px; padding: 6px 14px">
        Risk: ${extData.riskLevel}
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${extData.totalProbeAttempts} total probe attempts
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${extData.knownExtensionsProbed} known extensions targeted
      </span>
    </div>

    ${probedList.length > 0 ? `
      <div class="sub-header">
        🎯 Known Extensions Probed <span class="sub-header__count">(${probedList.length})</span>
      </div>
      ${probedList.map(ext => `
        <div class="permission-item">
          <div class="permission-item__icon">🧩</div>
          <div class="permission-item__info">
            <div class="permission-item__type">${escapeHtml(ext.name)}</div>
            <div class="permission-item__api">ID: ${escapeHtml(ext.id)} · via: ${ext.methods.join(', ')}</div>
          </div>
          <div>
            <span class="tag tag--tracker">Probed</span>
            <span class="tag tag--type" style="margin-left: 6px">×${ext.probeCount}</span>
          </div>
        </div>
      `).join('')}
    ` : ''}

    ${unknownList.length > 0 ? `
      <div class="sub-header" style="margin-top: 20px">
        ❓ Unknown Extension Probes <span class="sub-header__count">(${unknownList.length})</span>
      </div>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr><th>Extension ID</th><th>Method</th><th>Detail</th></tr></thead>
          <tbody>
            ${unknownList.slice(0, 20).map(p => `
              <tr>
                <td class="mono" style="font-size: 11px">${escapeHtml(p.extensionId)}</td>
                <td><span class="tag tag--type">${escapeHtml(p.method)}</span></td>
                <td class="truncated" style="font-size: 12px; color: var(--text-muted)">${escapeHtml(p.detail)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${extData.domScanAttempts > 0 ? `
      <div style="margin-top: 16px; padding: 12px 16px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--radius-md); font-size: 13px; color: var(--yellow-500)">
        ⚠️ ${extData.domScanAttempts} DOM scan attempts — the site queries the page for extension-injected elements
      </div>
    ` : ''}
  `;
}

// ==========================================
// USER PROFILING & BEHAVIORAL TRACKING
// ==========================================
function renderProfilingSection(container, profData) {
  if (!profData || profData.categoriesDetected === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">👤</div>
        <div class="empty-state__text">No user profiling or behavioral tracking detected</div>
      </div>`;
    return;
  }

  const highlights = profData.highlights || [];

  container.innerHTML = `
    <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap">
      <span class="tag tag--risk-${profData.intensityLevel === 'Aggressive' ? 'high' : profData.intensityLevel === 'Moderate' ? 'medium' : 'low'}" style="font-size: 13px; padding: 6px 14px">
        Intensity: ${profData.intensityLevel} (${profData.intensityScore}/100)
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${profData.totalTrackingVectors} tracking vectors
      </span>
      <span class="tag tag--type" style="font-size: 13px; padding: 6px 14px">
        ${profData.categoriesDetected} categories
      </span>
    </div>

    ${highlights.length > 0 ? `
      <div style="margin-bottom: 20px">
        ${highlights.map(h => `
          <div style="padding: 10px 16px; margin-bottom: 8px; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: var(--radius-md); font-size: 13px; color: var(--text-secondary)">
            ${escapeHtml(h)}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${profData.categories
      .sort((a, b) => {
        const riskOrder = { High: 0, Medium: 1, Low: 2 };
        return (riskOrder[a.riskLevel] || 2) - (riskOrder[b.riskLevel] || 2);
      })
      .map(cat => `
        <div class="fingerprint-card">
          <div class="fingerprint-card__header">
            <span class="fingerprint-card__category">${cat.icon} ${escapeHtml(cat.category)}</span>
            <div>
              <span class="tag tag--risk-${cat.riskLevel.toLowerCase()}">${cat.riskLevel}</span>
              <span class="tag tag--type" style="margin-left: 6px">${cat.totalEvents} events</span>
            </div>
          </div>
          <ul class="fingerprint-card__apis">
            ${cat.items.map(item => `
              <li class="fingerprint-card__api">
                <span class="fingerprint-card__api-name">${escapeHtml(item.type)}</span>
                <span class="fingerprint-card__api-count" title="${escapeHtml(item.detail)}">×${item.count}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
  `;
}

// ==========================================
// CRAWL SUMMARY
// ==========================================
function renderCrawlSummary(container, crawlReport) {
  if (!crawlReport || !crawlReport.aggregated) {
    container.classList.remove('active');
    return;
  }

  const { aggregated, overallScore, crawl } = crawlReport;

  function scoreColor(score) {
    if (score >= 80) return 'var(--green-500)';
    if (score >= 60) return 'var(--yellow-500)';
    if (score >= 40) return 'var(--orange-500)';
    return 'var(--red-500)';
  }

  container.innerHTML = `
    <div class="crawl-summary__header">
      <div class="crawl-summary__title">
        <span>🕷️</span>
        Deep Crawl Report
        <span class="section-panel__badge">${aggregated.totalPages} pages</span>
      </div>
      <div class="crawl-summary__meta">
        <span>🍪 ${aggregated.uniqueCookies} cookies</span>
        <span>👁️ ${aggregated.uniqueTrackerDomains} trackers</span>
        <span>🌐 ${aggregated.uniqueThirdPartyDomains} 3rd-party</span>
        <span>📄 ${aggregated.pagesWithNewFindings} pages with new findings</span>
      </div>
    </div>

    <div class="crawl-summary__body">
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px">
        <div style="font-size: 13px; color: var(--text-muted)">
          Worst page score:
          <span style="font-weight: 800; font-size: 20px; color: ${scoreColor(overallScore.score)}; margin-left: 6px">
            ${overallScore.score}
          </span>
          <span style="font-weight: 700; color: ${scoreColor(overallScore.score)}">
            (${overallScore.grade})
          </span>
        </div>
      </div>

      <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px">
        Crawled Pages — click to view details:
      </div>

      <div class="crawl-pages-grid">
        ${aggregated.pages.map((page, i) => {
          const newFindings = aggregated.newFindingsPerPage[i];
          const newCount =
            (newFindings?.newCookies?.length || 0) +
            (newFindings?.newTrackers?.length || 0) +
            (newFindings?.newThirdParty?.length || 0) +
            (newFindings?.newFingerprints?.length || 0) +
            (newFindings?.newProfiling?.length || 0);

          return `
            <div class="crawl-page-card" data-page-index="${i}">
              <div class="crawl-page-card__score" style="color: ${scoreColor(page.privacyScore.score)}; border-color: ${scoreColor(page.privacyScore.score)}">
                ${page.privacyScore.score}
              </div>
              <div class="crawl-page-card__info">
                <div class="crawl-page-card__url">${escapeHtml(page.url)}</div>
                <div class="crawl-page-card__title">${escapeHtml(page.pageTitle) || 'Untitled'}</div>
              </div>
              ${newCount > 0 ? `<div class="crawl-page-card__new-badge">+${newCount} new</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  container.classList.add('active');
}

// ==========================================
// PAGE SELECTOR TABS
// ==========================================
function renderPageSelector(container, crawlReport, activePageIndex, onPageSelect) {
  if (!crawlReport || !crawlReport.pageResults) {
    container.classList.remove('active');
    return;
  }

  const pages = crawlReport.pageResults;

  container.innerHTML = `
    <div class="page-selector__tabs">
      ${pages.map((page, i) => {
        const label = i === 0
          ? '🏠 Landing Page'
          : `📄 Page ${i + 1}`;
        const isActive = i === activePageIndex;

        return `
          <button class="page-selector__tab ${isActive ? 'active' : ''}" data-page-index="${i}">
            ${label}
          </button>
        `;
      }).join('')}
    </div>
  `;

  container.classList.add('active');

  // Bind click events
  container.querySelectorAll('.page-selector__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const index = parseInt(tab.dataset.pageIndex, 10);
      if (typeof onPageSelect === 'function') {
        onPageSelect(index);
      }
    });
  });
}

// ==========================================
// NEW FINDINGS PANEL (per-page)
// ==========================================
function renderNewFindings(container, newFindings, pageIndex) {
  // Don't show for landing page (index 0) — it's the baseline
  if (!newFindings || pageIndex === 0) {
    container.innerHTML = '';
    return;
  }

  const allNew = [
    ...(newFindings.newCookies || []).map((c) => ({ type: 'Cookie', label: `${c.name} (${c.domain})` })),
    ...(newFindings.newTrackers || []).map((t) => ({ type: 'Tracker', label: t.domain })),
    ...(newFindings.newThirdParty || []).map((t) => ({ type: '3rd Party', label: t.domain })),
    ...(newFindings.newFingerprints || []).map((f) => ({ type: 'Fingerprint', label: f.category })),
    ...(newFindings.newProfiling || []).map((p) => ({ type: 'Profiling', label: p.category })),
  ];

  if (allNew.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px 16px; margin-bottom: 20px; background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: var(--radius-md); font-size: 13px; color: var(--green-500)">
        ✅ No new data collection found on this page compared to the landing page
      </div>
    `;
    return;
  }

  const tagClass = {
    Cookie: 'tag--tracker',
    Tracker: 'tag--risk-high',
    '3rd Party': 'tag--third-party',
    Fingerprint: 'tag--risk-medium',
    Profiling: 'tag--category',
  };

  container.innerHTML = `
    <div class="crawl-new-findings">
      <div class="crawl-new-findings__title">
        🆕 ${allNew.length} new finding${allNew.length !== 1 ? 's' : ''} on this page (not found on landing page)
      </div>
      <div class="crawl-new-findings__list">
        ${allNew.map((item) => `
          <span class="tag ${tagClass[item.type] || 'tag--type'}" style="padding: 4px 10px">
            ${escapeHtml(item.type)}: ${escapeHtml(item.label)}
          </span>
        `).join('')}
      </div>
    </div>
  `;
}

// ==========================================
// UTILITIES
// ==========================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
