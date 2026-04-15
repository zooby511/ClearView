import Logger from './logger.js';
import { KNOWN_TRACKERS, classifyUrl, classifyDomain } from './analyzers/trackerDatabase.js';

const tabNetworkData = {};
let activeDetailedReportTab = null;

function initNetworkMonitor(tabId) {
  if (!tabNetworkData[tabId]) {
    tabNetworkData[tabId] = {
      requests: [],
      thirdPartyDomains: new Set(),
      trackerDomains: new Set(),
      totalRequests: 0,
      mainFrameUrl: null,
      mainFrameHostname: null
    };
  }
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    if (!details.url.startsWith('chrome-extension://')) {
        tabNetworkData[details.tabId] = {
            requests: [],
            thirdPartyDomains: new Set(),
            trackerDomains: new Set(),
            totalRequests: 0,
            mainFrameUrl: details.url,
            mainFrameHostname: new URL(details.url).hostname
        };
        chrome.action.setBadgeText({ text: '', tabId: details.tabId });
    }
  }
});

function getDomain(urlStr) {
  try { return new URL(urlStr).hostname; } catch(e) { return null; }
}

async function analyzeCookiesCount(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.length;
  } catch (e) {
    return 0;
  }
}

async function analyzeCookiesDetailed(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    const analysis = {
      total: cookies.length,
      firstPartyCount: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
      cookies: []
    };

    const mainHostname = new URL(url).hostname;
    
    for (const cookie of cookies) {
      const isThirdParty = !cookie.domain.includes(mainHostname.split('.').slice(-2).join('.'));
      const trackerInfo = classifyDomain(cookie.domain);

      if (isThirdParty) analysis.thirdPartyCount++;
      else analysis.firstPartyCount++;

      if (trackerInfo.isTracker) analysis.trackerCount++;

      analysis.cookies.push({
        name: cookie.name,
        domain: cookie.domain,
        isFirstParty: !isThirdParty,
        isTracker: trackerInfo.isTracker,
        trackerCategory: trackerInfo.category,
        trackerName: trackerInfo.name,
        flags: { secure: cookie.secure, httpOnly: cookie.httpOnly, SameSite: cookie.sameSite || "None" },
        session: cookie.session,
        size: cookie.name.length + cookie.value.length
      });
    }
    return analysis;
  } catch (e) {
    return { error: e.message, total: 0, cookies: [] };
  }
}

function processFingerprintCount(rawLog) {
  const deduped = new Set(rawLog.map(e => e.category + '::' + e.api));
  return deduped.size;
}

function processFingerprintDetailed(rawLog) {
  const deduped = {};
  rawLog.forEach((entry) => {
    const key = entry.category + '::' + entry.api;
    if (!deduped[key]) deduped[key] = { ...entry, count: 1 };
    else deduped[key].count++;
  });

  const entries = Object.values(deduped);
  const categories = {};
  entries.forEach((entry) => {
    if (!categories[entry.category]) {
      categories[entry.category] = { category: entry.category, apis: [], totalCalls: 0, riskLevel: 'Low' };
    }
    categories[entry.category].apis.push({ api: entry.api, detail: entry.detail, count: entry.count, stack: entry.stack });
    categories[entry.category].totalCalls += entry.count;
  });

  const categoryList = Object.values(categories);
  
  let riskScore = 0;
  const weights = { Canvas: 20, WebGL: 18, Audio: 15, WebRTC: 15, Fonts: 12, Navigator: 5, Screen: 3, Battery: 8, Network: 5, MediaDevices: 10, Timezone: 2, Beacon: 3 };
  categoryList.forEach(c => {
      riskScore += weights[c.category] || 3;
      c.riskLevel = ['Canvas','WebGL','Audio','WebRTC','Fonts'].includes(c.category) ? 'High' : 
                    ['Navigator','Screen','Battery','Network','MediaDevices'].includes(c.category) ? 'Medium' : 'Low';
  });

  return {
    totalApiCalls: rawLog.length,
    uniqueApis: entries.length,
    categoriesDetected: categoryList.length,
    categories: categoryList,
    riskScore: Math.min(100, riskScore),
    riskLevel: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low'
  };
}

function calculatePrivacyScore(report) {
  let score = 100;
  let deductions = [];

  const networkTrackerCount = report.network?.trackerDomainCount || 0;
  const networkThirdPartyCount = report.network?.thirdPartyDomainCount || 0;
  const cookieThirdPartyCount = report.cookies?.thirdPartyCount || 0;
  const cookieTrackerCount = report.cookies?.trackerCount || 0;

  if (cookieThirdPartyCount > 0) {
    const deduction = Math.min(cookieThirdPartyCount * 2, 20);
    score -= deduction;
    deductions.push({ category: 'Third-Party Cookies', points: -deduction, reason: `Found ${cookieThirdPartyCount} third-party cookies` });
  }

  if (cookieTrackerCount > 0) {
    const deduction = Math.min(cookieTrackerCount * 3, 15);
    score -= deduction;
    deductions.push({ category: 'Tracker Cookies', points: -deduction, reason: `Found ${cookieTrackerCount} known tracking cookies` });
  }

  if (networkThirdPartyCount > 5) {
    const deduction = Math.min((networkThirdPartyCount - 5) * 2, 15);
    score -= deduction;
    deductions.push({ category: 'Third-Party Requests', points: -deduction, reason: `Loaded assets from ${networkThirdPartyCount} third-party domains` });
  }

  if (networkTrackerCount > 0) {
    const deduction = Math.min(networkTrackerCount * 4, 20);
    score -= deduction;
    deductions.push({ category: 'Known Trackers', points: -deduction, reason: `Contacted ${networkTrackerCount} known tracking domains` });
  }

  let fpScore = report.fingerprinting?.riskScore || 0;
  if (fpScore > 20) {
    const deduction = Math.min(Math.round(fpScore * 0.2), 20);
    score -= deduction;
    deductions.push({ category: 'Fingerprinting', points: -deduction, reason: `High API fingerprinting risk score (${fpScore})` });
  }

  score = Math.max(0, Math.min(100, score));
  let grade = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';

  return { score, grade, deductions };
}


// Automatically analyze a tab and update its badge/storage
async function evaluateTabMetrics(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) return;

    const cookieCount = await analyzeCookiesCount(tab.url);
    
    initNetworkMonitor(tabId);
    const nw = tabNetworkData[tabId];
    
    const trackerSet = new Set();
    nw.trackerDomains.forEach(str => trackerSet.add(JSON.parse(str).domain));
    const trackerCount = trackerSet.size;

    let fingerprintCount = 0;
    let storageCount = 0;
    try {
      const contentResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'GET_ANALYSIS_DATA' }, (res) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(res);
        });
      });

      if (contentResponse) {
        fingerprintCount = processFingerprintCount(contentResponse.mainWorldLogs?.fingerprint || []);
        const ls = contentResponse.storage?.localStorage?.itemCount || 0;
        const ss = contentResponse.storage?.sessionStorage?.itemCount || 0;
        storageCount = ls + ss;
      }
    } catch(err) {}

    const categories = {
      Cookies: cookieCount,
      Trackers: trackerCount,
      Fingerprinting: fingerprintCount,
      Storage: storageCount
    };

    let maxName = 'Cookies';
    let maxCount = cookieCount;
    for (const [key, value] of Object.entries(categories)) {
      if (value > maxCount) {
        maxCount = value;
        maxName = key;
      }
    }

    if (maxCount > 0) {
      chrome.action.setBadgeText({ text: maxCount.toString(), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
    }

    await chrome.storage.local.set({ 
      [`tab_${tabId}`]: { url: tab.url, maxName, maxCount, all: categories }
    });

  } catch (e) { }
}

async function generateDetailedReport(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) throw new Error("Invalid tab URL");

    const cookies = await analyzeCookiesDetailed(tab.url);
    initNetworkMonitor(tabId);
    const nw = tabNetworkData[tabId];
    const parsedTrackers = Array.from(nw.trackerDomains).map(str => JSON.parse(str));
    
    const thirdPartyDetailed = [];
    Array.from(nw.thirdPartyDomains).forEach(d => {
        const tr = classifyDomain(d);
        thirdPartyDetailed.push({
            domain: d,
            requestCount: nw.requests.filter(r => r.domain === d).length || 1,
            isTracker: tr.isTracker,
            trackerName: tr.name,
            types: { "script": true }
        });
    });

    const parsedTrackerDetailed = parsedTrackers.map(t => {
        return {
            domain: t.domain,
            trackerName: t.name,
            trackerCategory: t.category,
            requestCount: nw.requests.filter(r => r.domain === t.domain).length || 1
        };
    });

    const network = {
      totalRequests: nw.totalRequests,
      thirdPartyDomainCount: nw.thirdPartyDomains.size,
      trackerDomainCount: parsedTrackers.length,
      trackerDomains: parsedTrackerDetailed,
      thirdPartyDomains: thirdPartyDetailed,
      requests: nw.requests
    };

    let contentResponse = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'GET_ANALYSIS_DATA' }, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    });

    if (!contentResponse) {
      throw new Error("Could not communicate with page content script. Ensure tab is loaded.");
    }

    const fingerprinting = processFingerprintDetailed(contentResponse.mainWorldLogs.fingerprint || []);
    
    // Process Permissions correctly
    const rawPermissions = contentResponse.mainWorldLogs.permission || [];
    const groupedPerms = {};
    rawPermissions.forEach(p => {
        const typeMap = { 'Geolocation': '📍 Location', 'Camera': '📷 Camera', 'Microphone': '🎤 Microphone', 'Notification': '🔔 Notifications' };
        const iconMap = { 'Geolocation': '📍', 'Camera': '📷', 'Microphone': '🎤', 'Notification': '🔔' };
        if (!groupedPerms[p.api]) {
            groupedPerms[p.api] = { type: typeMap[p.api] || p.api, icon: iconMap[p.api] || '🔑', api: p.api, calls: [], count: 0, riskLevel: 'Medium' };
        }
        groupedPerms[p.api].calls.push({ api: p.method || p.api });
        groupedPerms[p.api].count++;
        if (['Geolocation', 'Camera', 'Microphone'].includes(p.api)) groupedPerms[p.api].riskLevel = 'High';
    });
    const permissionsArr = Object.values(groupedPerms);
    
    // Process Extensions correctly
    const extLog = contentResponse.mainWorldLogs.extension || [];
    const knownExtensions = {
      'cjpalhdlnbpafiamejdnhcphjbkeiagm': 'uBlock Origin',
      'gcbommkclmclpchllfjekccdconpgofh': 'HTTPS Everywhere',
      'pkehgijcmpdhfbdbbnkijodmdjhbjlgp': 'Privacy Badger',
      'kbfnbcaeplbcioakkpcpgfkobkghlhen': 'Grammarly',
      'bkbgpkiicmgkigccaofcbnffneneeddl': 'DuckDuckGo Privacy Essentials',
      'hnmpcagpplmpfojmgmnngcmpknjuodjg': 'Ghostery',
      'ghbmnnjooekpmoecnnnilnnbdlolhkhi': 'Google Drive Offline',
      'nngceckbapebfimnlniiiahkandclblb': 'Bitwarden',
      'nkbihfbeogaeaoehlefnkodbefgpgknn': 'MetaMask',
      'fhbohimaelbohpjbbldcngcnapndodjp': 'Honey',
    };
    const unknownProbes = [];
    const probedMap = {};
    let domScanAttempts = 0;
    extLog.forEach(probe => {
        if (probe.method === 'DOM_SCAN') {
            domScanAttempts++;
            return;
        }
        if (knownExtensions[probe.detail]) {
            if (!probedMap[probe.detail]) probedMap[probe.detail] = { name: knownExtensions[probe.detail], id: probe.detail, methods: [], probeCount: 0 };
            probedMap[probe.detail].methods.push(probe.method);
            probedMap[probe.detail].probeCount++;
        } else {
            unknownProbes.push({ extensionId: probe.detail, method: probe.method, detail: 'Unknown Extension' });
        }
    });

    const extensions = {
        totalProbeAttempts: extLog.length,
        probedExtensions: Object.values(probedMap),
        unknownProbes,
        domScanAttempts,
        knownExtensionsProbed: Object.values(probedMap).length,
        riskLevel: extLog.length > 5 ? 'High' : (extLog.length > 0 ? 'Medium' : 'Low')
    };

    // Process Profiling correctly
    const profilingData = contentResponse.mainWorldLogs.profiling || [];
    const profilingCategories = {};
    profilingData.forEach(d => {
        if (!profilingCategories[d.category]) {
            const iconMap = { 'Mouse Tracking': '🖱️', 'Keystroke Dynamics': '⌨️', 'Form Monitoring': '📝', 'Scroll Tracking': '📜', 'Focus Tracking': '👁️', 'Device Motion': '📱' };
            const riskMap = { 'Mouse Tracking': 'High', 'Keystroke Dynamics': 'High', 'Form Monitoring': 'Medium', 'Device Motion': 'Medium' };
            profilingCategories[d.category] = { category: d.category, icon: iconMap[d.category] || '📊', items: [], totalEvents: 0, riskLevel: riskMap[d.category] || 'Low' };
        }
        
        let found = profilingCategories[d.category].items.find(i => i.type === d.method);
        if(!found) {
            found = { type: d.method, count: 0, detail: d.detail };
            profilingCategories[d.category].items.push(found);
        }
        found.count++;
        profilingCategories[d.category].totalEvents++;
    });

    const report = {
      scan: { url: tab.url, pageTitle: tab.title, timestamp: new Date().toISOString() },
      cookies,
      network,
      storage: contentResponse.storage,
      fingerprinting,
      permissions: {
          totalPermissionRequests: permissionsArr.length,
          permissions: permissionsArr,
          highRiskPermissions: permissionsArr.filter(p => p.riskLevel === 'High')
      },
      extensions,
      profiling: {
        categoriesDetected: Object.keys(profilingCategories).length,
        totalTrackingVectors: profilingData.length,
        intensityScore: Math.min(100, profilingData.length * 2),
        intensityLevel: profilingData.length > 20 ? 'Aggressive' : 'Low',
        categories: Object.values(profilingCategories)
      }
    };

    report.privacyScore = calculatePrivacyScore(report);
    return report;
  } catch (err) {
    Logger.error("Error building detailed report", err);
    throw err;
  }
}

// Listen to network requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId, url, type } = details;
    if (tabId < 0 || !url.startsWith('http')) return;

    initNetworkMonitor(tabId);
    const data = tabNetworkData[tabId];
    data.totalRequests++;

    const reqDomain = getDomain(url);
    if (!reqDomain) return;

    let isThirdParty = false;
    if (data.mainFrameHostname) {
      const mainBase = data.mainFrameHostname.split('.').slice(-2).join('.');
      const reqBase = reqDomain.split('.').slice(-2).join('.');
      isThirdParty = mainBase !== reqBase;
    }

    if (isThirdParty) {
      data.thirdPartyDomains.add(reqDomain);
    }

    const trackerResult = classifyUrl(url);
    data.requests.push({ url, domain: reqDomain });

    if (trackerResult.isTracker) {
      const trackerStr = JSON.stringify({ domain: reqDomain, category: trackerResult.category, name: trackerResult.name });
      const wasAdding = !data.trackerDomains.has(trackerStr);
      data.trackerDomains.add(trackerStr);
      if (wasAdding) evaluateTabMetrics(tabId);
    }
  },
  { urls: ["<all_urls>"] },
  []
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') evaluateTabMetrics(tabId);
});

// Handle messages from popup / dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'REQUEST_REFRESH') {
    activeDetailedReportTab = request.tabId; // remember to generate full report against this tab
    evaluateTabMetrics(request.tabId).then(() => { sendResponse({ success: true }); });
    return true; 
  } else if (request.action === 'GET_FULL_REPORT') {
    // If we have an active tab we tracked from the popup
    const targetTab = activeDetailedReportTab; 
    if (!targetTab) {
        sendResponse({ error: "No active tab selected for report." });
        return;
    }
    generateDetailedReport(targetTab).then(report => {
        sendResponse({ success: true, report });
    }).catch(e => {
        sendResponse({ error: e.message });
    });
    return true;
  }
});
