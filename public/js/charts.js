/**
 * charts.js
 * Chart.js visualizations for the network and cookie data.
 */

// Color palette matching our theme
const CHART_COLORS = {
  cyan: 'rgba(6, 182, 212, 0.8)',
  purple: 'rgba(139, 92, 246, 0.8)',
  pink: 'rgba(236, 72, 153, 0.8)',
  orange: 'rgba(249, 115, 22, 0.8)',
  yellow: 'rgba(245, 158, 11, 0.8)',
  green: 'rgba(16, 185, 129, 0.8)',
  red: 'rgba(239, 68, 68, 0.8)',
  blue: 'rgba(59, 130, 246, 0.8)',
  gray: 'rgba(148, 163, 184, 0.5)',
};

const CHART_COLORS_ARRAY = Object.values(CHART_COLORS);

// Shared chart defaults
const CHART_DEFAULTS = {
  color: '#94a3b8',
  backgroundColor: 'transparent',
  borderColor: 'rgba(148, 163, 184, 0.12)',
  font: {
    family: "'Inter', sans-serif",
  },
};

// Store chart instances for cleanup
let chartInstances = {};

/**
 * Destroy all existing charts
 */
function destroyAllCharts() {
  Object.values(chartInstances).forEach((chart) => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });
  chartInstances = {};
}

/**
 * Render all charts for the network section
 * @param {HTMLElement} container - #network-charts element
 * @param {Object} networkData - Network analysis data
 * @param {Object} cookieData - Cookie analysis data
 */
function renderNetworkCharts(container, networkData, cookieData) {
  destroyAllCharts();

  container.innerHTML = `
    <div class="chart-card">
      <div class="chart-card__title">Request Type Distribution</div>
      <div class="chart-container"><canvas id="chart-request-types"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-card__title">Cookie Classification</div>
      <div class="chart-container"><canvas id="chart-cookie-types"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-card__title">Top Third-Party Domains</div>
      <div class="chart-container"><canvas id="chart-top-domains"></canvas></div>
    </div>
  `;

  // Wait for DOM update
  requestAnimationFrame(() => {
    createRequestTypeChart(networkData);
    createCookieTypeChart(cookieData);
    createTopDomainsChart(networkData);
  });
}

/**
 * Doughnut chart: Request type breakdown
 */
function createRequestTypeChart(data) {
  const canvas = document.getElementById('chart-request-types');
  if (!canvas) return;

  const types = data.typeBreakdown || {};
  const labels = Object.keys(types);
  const values = Object.values(types);

  chartInstances['requestTypes'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: CHART_COLORS_ARRAY.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: CHART_DEFAULTS.color,
            font: { family: CHART_DEFAULTS.font.family, size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
        },
      },
    },
  });
}

/**
 * Doughnut chart: Cookie type breakdown
 */
function createCookieTypeChart(data) {
  const canvas = document.getElementById('chart-cookie-types');
  if (!canvas) return;

  const labels = [];
  const values = [];
  const colors = [];

  if (data.firstPartyCount > 0) {
    labels.push('First Party');
    values.push(data.firstPartyCount);
    colors.push(CHART_COLORS.green);
  }
  if (data.thirdPartyCount - data.trackerCount > 0) {
    labels.push('Third Party');
    values.push(data.thirdPartyCount - data.trackerCount);
    colors.push(CHART_COLORS.yellow);
  }
  if (data.trackerCount > 0) {
    labels.push('Tracker');
    values.push(data.trackerCount);
    colors.push(CHART_COLORS.red);
  }

  if (labels.length === 0) {
    labels.push('None');
    values.push(1);
    colors.push(CHART_COLORS.gray);
  }

  chartInstances['cookieTypes'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: CHART_DEFAULTS.color,
            font: { family: CHART_DEFAULTS.font.family, size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
        },
      },
    },
  });
}

/**
 * Horizontal bar chart: Top third-party domains by request count
 */
function createTopDomainsChart(data) {
  const canvas = document.getElementById('chart-top-domains');
  if (!canvas) return;

  const topDomains = (data.thirdPartyDomains || []).slice(0, 8);
  const labels = topDomains.map((d) =>
    d.domain.length > 25 ? d.domain.substring(0, 25) + '…' : d.domain
  );
  const values = topDomains.map((d) => d.requestCount);
  const colors = topDomains.map((d) =>
    d.isTracker ? CHART_COLORS.red : CHART_COLORS.cyan
  );

  if (topDomains.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No third-party domains', canvas.width / 2, canvas.height / 2);
    return;
  }

  chartInstances['topDomains'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            title: (items) => topDomains[items[0].dataIndex]?.domain || '',
            label: (item) => `${item.raw} requests`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: CHART_DEFAULTS.color,
            font: { family: CHART_DEFAULTS.font.family, size: 11 },
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: CHART_DEFAULTS.color,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
          },
        },
      },
    },
  });
}
