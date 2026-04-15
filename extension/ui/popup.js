document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    document.getElementById('loading-content').textContent = 'This page cannot be analyzed.';
    return;
  }

  // Force a fresh request in background
  chrome.runtime.sendMessage({ action: 'REQUEST_REFRESH', tabId: tab.id });

  // Function to render data from storage
  async function updateUI() {
    const data = await chrome.storage.local.get(`tab_${tab.id}`);
    const tabData = data[`tab_${tab.id}`];

    if (tabData) {
      document.getElementById('loading-content').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';

      document.getElementById('page-url').textContent = tabData.url;

      // Update hero
      document.getElementById('hero-label').textContent = `Highest Count: ${tabData.maxName}`;
      document.getElementById('hero-value').textContent = tabData.maxCount;
      
      const descriptions = {
        'Cookies': 'tracking cookies detected',
        'Trackers': 'tracking domains intercepted',
        'Fingerprinting': 'fingerprinting APIs accessed',
        'Storage': 'items placed in local storage'
      };
      document.getElementById('hero-desc').textContent = descriptions[tabData.maxName] || 'items detected';

      // Update cards
      document.getElementById('stat-cookies').textContent = tabData.all?.Cookies || 0;
      document.getElementById('stat-trackers').textContent = tabData.all?.Trackers || 0;
      document.getElementById('stat-fingerprint').textContent = tabData.all?.Fingerprinting || 0;
      document.getElementById('stat-storage').textContent = tabData.all?.Storage || 0;
    }
  }

  // Initial render
  updateUI();

  // Poll for updates (since tracking pixels load asynchronously)
  setInterval(updateUI, 1000);

  // Click listeners to open dashboard
  function openDashboard() {
    chrome.tabs.create({ url: 'ui/dashboard.html' });
  }

  document.getElementById('hero-stat').addEventListener('click', openDashboard);
  document.getElementById('hero-stat').style.cursor = 'pointer';

  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', openDashboard);
    card.style.cursor = 'pointer';
  });
});
