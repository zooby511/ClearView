# Technical Architecture — Chrome Website Data Analyzer

> **Purpose**: This document provides the full technical blueprint of the project for any developer or AI agent to quickly understand the codebase, make changes, or add new features.

---

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Architecture Diagram](#architecture-diagram)
- [File-by-File Reference](#file-by-file-reference)
- [Data Flow](#data-flow)
- [Analyzer Module Pattern](#analyzer-module-pattern)
- [Privacy Score Algorithm](#privacy-score-algorithm)
- [Deep Crawl Engine](#deep-crawl-engine)
- [Frontend Architecture](#frontend-architecture)
- [Key Design Decisions](#key-design-decisions)
- [Adding a New Analyzer](#adding-a-new-analyzer)
- [Known Limitations](#known-limitations)
- [Environment Notes](#environment-notes)

---

## System Overview

This is a **full-stack Node.js application** that launches a headless Chrome browser (via Puppeteer), navigates to a target website, injects monitoring scripts, records all data the website collects, and presents a comprehensive privacy risk report.

```
           ┌──────────────┐
           │   Browser UI  │  (http://localhost:3000)
           │  index.html   │
           │  app.js       │
           │  components.js│
           │  charts.js    │
           └──────┬───────┘
                  │ HTTP (POST /api/scan, POST /api/crawl, GET SSE)
                  ▼
           ┌──────────────┐
           │  server.js    │  Express server (port 3000)
           │  - /api/scan  │  Single-page scan
           │  - /api/crawl │  Multi-page crawl + SSE
           └──────┬───────┘
                  │ Puppeteer (headless Chrome)
                  ▼
           ┌──────────────┐
           │  analyzers/   │  9 analysis modules
           │  (injected    │  Injected into page context
           │   into page)  │  via evaluateOnNewDocument
           └──────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js ≥ 18 | Server runtime |
| **Server** | Express 4.x | REST API + static file serving |
| **Browser Automation** | Puppeteer 23.x | Launches headless Chrome, injects scripts, collects data |
| **Network Monitoring** | Chrome DevTools Protocol (CDP) | Low-level request/response interception |
| **Frontend** | Vanilla HTML/CSS/JS | No framework — single-page dashboard |
| **Charts** | Chart.js 4.x (CDN) | Doughnut and bar charts for network data |
| **Fonts** | Google Fonts (Inter, JetBrains Mono) | Typography |

### Dependencies (package.json)

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "puppeteer": "^23.0.0"
  }
}
```

No other backend dependencies. Zero frontend build tools.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         server.js                                    │
│                                                                     │
│  POST /api/scan ─────► scanSinglePage(browser, url, duration, domain)│
│                              │                                       │
│                              ├── page.evaluateOnNewDocument(...)     │
│                              │     ├── getFingerprintInjectionScript │
│                              │     ├── getPermissionInjectionScript  │
│                              │     ├── getExtensionInjectionScript   │
│                              │     └── getProfilingInjectionScript   │
│                              │                                       │
│                              ├── page.goto(url)                     │
│                              ├── wait(duration)                     │
│                              │                                       │
│                              ├── analyzeCookies(page)               │
│                              ├── analyzeStorage(page)               │
│                              ├── networkMonitor.getResults()        │
│                              ├── collectFingerprintResults(page)    │
│                              ├── collectPermissionResults(page)     │
│                              ├── collectExtensionResults(page)      │
│                              ├── collectProfilingResults(page)      │
│                              └── extractLinks(page, domain)         │
│                                                                     │
│  POST /api/crawl ────► BFS loop calling scanSinglePage per page     │
│  GET /api/crawl/progress ──► Server-Sent Events (SSE)               │
│                                                                     │
│  calculatePrivacyScore({cookies, network, fingerprint, ...})        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File-by-File Reference

### `server.js` (Entry Point)

| Function/Route | Purpose |
|---------------|---------|
| `scanSinglePage(browser, url, duration, domain)` | Reusable scan function — opens a new tab, injects scripts, navigates, waits, collects all data, returns report object |
| `POST /api/scan` | Single-page endpoint — launches browser, calls `scanSinglePage`, returns report JSON |
| `POST /api/crawl` | Multi-page endpoint — launches browser, scans landing page, BFS-discovers links, scans each page, aggregates results, streams SSE progress |
| `GET /api/crawl/progress` | SSE endpoint — pushes `{ type: 'scanning' | 'page_done' | 'page_error' | 'complete' }` events |
| `GET /api/status` | Check if a scan is currently running |
| `calculatePrivacyScore(data)` | Computes 0-100 score with deductions and letter grade |

**Important**: `scanSinglePage` creates a **new `page` (tab)** per call but reuses the same browser instance. This means cookies accumulate naturally across pages in crawl mode, just like a real browsing session.

---

### `analyzers/cookieAnalyzer.js`

**Exports**: `{ analyzeCookies }`

- Uses `page.cookies()` (Puppeteer CDP) to get all cookies
- Cross-references each cookie's domain against the tracker database
- Classifies as first-party vs third-party based on `targetDomain`
- Returns: `{ total, firstPartyCount, thirdPartyCount, trackerCount, cookies: [...] }`

---

### `analyzers/storageAnalyzer.js`

**Exports**: `{ analyzeStorage }`

- Uses `page.evaluate()` to read `localStorage`, `sessionStorage`, and `indexedDB.databases()`
- Calculates per-item size and total storage footprint
- Returns: `{ localStorage: { items, itemCount, totalSize }, sessionStorage: {...}, indexedDB: {...}, totalStorageSizeFormatted }`

---

### `analyzers/networkAnalyzer.js`

**Exports**: `{ createNetworkMonitor }`

- Creates a CDP event listener on `Network.requestWillBeSent` and `Network.responseReceived`
- Records every request: URL, type, domain, status code
- Cross-references domains against tracker database
- **Returns a monitor object** with methods:
  - `getResults()` → `{ totalRequests, thirdPartyDomainCount, trackerDomainCount, trackerDomains: [...], thirdPartyDomains: [...] }`
  - `getSetCookieHeaders()` → Array of Set-Cookie headers for cookie analysis

---

### `analyzers/fingerprintAnalyzer.js`

**Exports**: `{ getFingerprintInjectionScript, collectFingerprintResults }`

**Pattern**: Two-phase — inject before page load, collect after.

- `getFingerprintInjectionScript()` returns a string of JavaScript that, when injected via `evaluateOnNewDocument`, wraps sensitive browser APIs with `Proxy` and `Object.defineProperty` to count API calls
- Monitored categories: Canvas, WebGL, Audio, Navigator, Screen, Battery, Network, Beacon, Font, WebRTC
- `collectFingerprintResults(page)` reads `window.__fingerprintData` and computes risk score
- Returns: `{ totalApiCalls, uniqueApis, categoriesDetected, riskScore, riskLevel, categories: [...] }`

---

### `analyzers/permissionAnalyzer.js`

**Exports**: `{ getPermissionInjectionScript, collectPermissionResults }`

**Pattern**: Same two-phase inject/collect.

- Intercepts: `navigator.permissions.query()`, `navigator.geolocation.getCurrentPosition()`, `navigator.mediaDevices.getUserMedia()`, `Notification.requestPermission()`, `navigator.clipboard.read/write()`, and 10+ more
- Classifies each by risk level (Low/Medium/High) and assigns an icon
- Returns: `{ totalPermissionRequests, permissions: [...], highRiskPermissions: [...] }`

---

### `analyzers/extensionAnalyzer.js`

**Exports**: `{ getExtensionInjectionScript, collectExtensionResults }`

**Pattern**: Same two-phase inject/collect.

- Database of **40+ popular extension IDs** (uBlock Origin, LastPass, MetaMask, etc.)
- Intercepts: `fetch()`, `XMLHttpRequest.open()`, `document.createElement('img/script/link')`, `chrome.runtime.sendMessage()`
- Detects DOM scanning via `MutationObserver` + `querySelectorAll` interception
- Returns: `{ totalProbeAttempts, knownExtensionsProbed, probedExtensions: [...], unknownProbes: [...], domScanAttempts, riskLevel }`

---

### `analyzers/profilingAnalyzer.js`

**Exports**: `{ getProfilingInjectionScript, collectProfilingResults }`

**Pattern**: Same two-phase inject/collect.

- Intercepts `addEventListener` globally to detect:
  - **Keystroke listeners** (keydown, keyup, keypress)
  - **Mouse/touch tracking** (mousemove, click, scroll, touchstart)
  - **Clipboard access** (copy, cut, paste)
  - **Engagement tracking** (visibilitychange, focus, blur, beforeunload)
  - **Form monitoring** (input, change, blur on form elements)
- Also monitors: `IntersectionObserver`, `MutationObserver`, `history.pushState`, social login iframes, link decoration, persistent user IDs in localStorage
- Calculates intensity score (0-100) with level: Minimal / Low / Moderate / Aggressive
- Returns: `{ categoriesDetected, totalTrackingVectors, intensityScore, intensityLevel, categories: [...], highlights: [...] }`

---

### `analyzers/trackerDatabase.js`

**Exports**: `{ isKnownTracker, getTrackerInfo, TRACKER_DATABASE }`

- Contains 100+ domain entries organized by category:
  - **Analytics**: Google Analytics, Hotjar, Heap, Mixpanel, Amplitude, etc.
  - **Advertising**: DoubleClick, Facebook Pixel, Criteo, AdRoll, etc.
  - **Social Media**: Facebook, Twitter, LinkedIn, Reddit, Pinterest, etc.
  - **Tag Managers**: Google Tag Manager, Tealium, Segment, etc.
  - **Fingerprinting**: FingerprintJS, ThreatMetrix, etc.
  - **CDN/Other**: Google Fonts, Cloudflare, jsDelivr, etc.
- `isKnownTracker(domain)` does exact match + parent-domain matching (e.g., `ads.facebook.com` matches `facebook.com`)

---

### `analyzers/crawlAnalyzer.js`

**Exports**: `{ extractLinks, CrawlQueue, aggregateResults, normalizeUrl }`

- `extractLinks(page, domain)` — Runs `page.evaluate()` to get all `<a href>` links, filters to same-domain, normalizes URLs, deduplicates
- `CrawlQueue` — BFS queue with depth tracking, max-page cap, and visited-URL deduplication
- `aggregateResults(pageResults[])` — Merges all per-page results, tracks which items were found on which pages, computes "new findings" per page (items not on the landing page)
- `normalizeUrl(url)` — Strips fragments, sorts query params, removes trailing slashes, lowercases hostname

---

### `public/index.html`

Semantic HTML5 dashboard with:
- Search bar with crawl toggle and options
- Loading overlay with step animation
- Crawl progress panel (SSE-driven)
- Welcome section with feature cards
- Results container: crawl summary → page selector → scan info → summary cards → privacy score → 7 section panels (cookies, network, fingerprinting, storage, permissions, extensions, profiling)

---

### `public/js/app.js`

Main application controller:
- Handles both single-scan (`POST /api/scan`) and crawl (`POST /api/crawl`) flows
- SSE connection management for crawl progress
- Page switching logic (crawl mode) — re-renders all sections for selected page
- Loading animation sequencing
- `renderResults(report)` — unified render function used for both scan modes

---

### `public/js/components.js`

Pure render functions (no state):

| Function | Purpose |
|----------|---------|
| `renderSummaryCards(container, report)` | 8 summary metric cards |
| `renderPrivacyScore(container, score)` | SVG ring + deduction breakdown |
| `renderCookieTable(container, data)` | Sortable cookie table |
| `renderNetworkSection(container, data)` | Tracker list + third-party domain table + chart placeholders |
| `renderFingerprintSection(container, data)` | Categorized fingerprint API cards |
| `renderStorageSection(container, data)` | localStorage/sessionStorage/IndexedDB |
| `renderPermissionSection(container, data)` | Permission request cards |
| `renderExtensionSection(container, data)` | Extension probe details |
| `renderProfilingSection(container, data)` | Profiling category cards with intensity |
| `renderCrawlSummary(container, report)` | Crawl overview with page cards |
| `renderPageSelector(container, report, index, callback)` | Tab bar for page switching |
| `renderNewFindings(container, findings, index)` | New-findings highlight banner |

---

### `public/js/charts.js`

**Exports** (global): `renderNetworkCharts(container, networkData, cookieData)`

Creates three Chart.js charts:
1. **Request Type Distribution** — Doughnut chart
2. **Cookie Classification** — Doughnut (first-party vs third-party vs tracker)
3. **Top Third-Party Domains** — Horizontal bar chart

---

### `public/css/styles.css`

Premium dark theme with:
- CSS custom properties (design tokens) for consistent theming
- Glassmorphism cards with `backdrop-filter: blur(20px)`
- Animated background gradients
- Custom scrollbar
- Responsive grid layouts (auto-fill, minmax)
- 380+ lines of crawl-specific styles (toggle switch, progress bar, page cards, tabs)
- Media queries for tablet (768px) and mobile (480px)

---

## Data Flow

### Single-Page Scan

```
1. Frontend sends POST /api/scan { url: "reddit.com", duration: 10 }
2. Server launches headless Chrome (puppeteer.launch)
3. Creates new page (tab)
4. Injects 4 monitoring scripts via evaluateOnNewDocument (BEFORE page loads)
5. Creates CDP session, enables Network domain
6. Navigates to URL (page.goto, waitUntil: networkidle2)
7. Waits `duration` seconds for delayed trackers
8. Collects results from all 7 analyzers
9. Calculates privacy score
10. Returns JSON report to frontend
11. Closes browser
```

### Deep Crawl

```
1. Frontend sends POST /api/crawl { url, duration: 5, maxPages: 10 }
2. Frontend opens SSE connection to GET /api/crawl/progress
3. Server launches browser ONCE
4. Scans landing page → extracts internal links
5. Creates CrawlQueue with discovered links (BFS, max depth 2)
6. For each queued URL (up to maxPages):
   a. Opens new tab (scanSinglePage)
   b. Injects monitoring scripts
   c. Navigates, waits, collects
   d. Extracts new links → adds to queue
   e. Closes tab
   f. Sends SSE progress event
7. Aggregates all results (unique cookies, trackers, new findings)
8. Returns crawl report JSON
9. Closes browser
10. Frontend renders crawl summary + page selector + landing page results
```

---

## Analyzer Module Pattern

Every analyzer follows the same two-phase pattern:

### Phase 1: Injection (before page load)

```javascript
// Returns a JavaScript string to be injected
function getXxxInjectionScript() {
  return `
    // This runs in the page context, not Node.js
    window.__xxxData = [];
    
    // Intercept browser APIs using Proxy, Object.defineProperty,
    // or by wrapping addEventListener
    const original = Navigator.prototype.someAPI;
    Navigator.prototype.someAPI = function() {
      window.__xxxData.push({ api: 'someAPI', timestamp: Date.now() });
      return original.apply(this, arguments);
    };
  `;
}
```

### Phase 2: Collection (after page settles)

```javascript
async function collectXxxResults(page) {
  const rawData = await page.evaluate(() => window.__xxxData);
  
  // Process, categorize, score
  return {
    totalItems: rawData.length,
    categories: [...],
    riskScore: calculateRisk(rawData),
  };
}
```

### To add a new analyzer:

1. Create `analyzers/newAnalyzer.js` following the pattern above
2. Export `{ getNewInjectionScript, collectNewResults }`
3. In `server.js`:
   - Import the module
   - Add `await page.evaluateOnNewDocument(getNewInjectionScript())` in `scanSinglePage()`
   - Add `const newResults = await collectNewResults(page)` after the wait
   - Include in the report object and `calculatePrivacyScore()`
4. In `public/index.html`:
   - Add a new `section-panel` block with badge
5. In `public/js/components.js`:
   - Add `renderNewSection(container, data)` function
6. In `public/js/app.js`:
   - Add DOM references and render calls

---

## Privacy Score Algorithm

Located in `server.js` → `calculatePrivacyScore()`:

```
Starting score: 100

Deduction categories:
  Third-Party Cookies:     -2 per cookie,     max -20
  Tracker Cookies:         -3 per cookie,     max -15
  Third-Party Domains:     -2 per domain (>5), max -15
  Tracker Domains:         -4 per domain,     max -20
  Fingerprinting:          -0.2 × riskScore,  max -20
  High-Risk Permissions:   -5 per permission, max -10
  Extension Probing:       -2 per extension,  max -10
  User Profiling:          -0.15 × intensity, max -15

Final score: max(0, min(100, score))

Grades: A (≥90), B (≥80), C (≥60), D (≥40), F (<40)
```

---

## Deep Crawl Engine

### Link Discovery (`extractLinks`)

```
1. Run page.evaluate() to get all <a href> elements
2. Filter:
   - Same domain only (exact or subdomain match)
   - HTTP/HTTPS only
   - Skip: images, PDFs, downloads, fonts, JS, CSS, mailto, tel, javascript:
3. Normalize each URL:
   - Remove fragments (#)
   - Sort query parameters
   - Remove trailing slash
   - Lowercase hostname
4. Deduplicate
```

### Crawl Queue (`CrawlQueue`)

- BFS (breadth-first search) traversal
- `maxPages` cap (default 10, hard max 20)
- `maxDepth` cap (default 2, hard max 3)
- Visited-URL set for dedup (using normalized URLs)

### Result Aggregation (`aggregateResults`)

For each data point (cookie, tracker, third-party domain, fingerprint category, profiling category):
- Track which pages it was found on
- Compare to landing page (index 0)
- If not on landing page → mark as "new finding" for that page
- Count `pagesWithNewFindings`

---

## Frontend Architecture

### No framework — vanilla JS

The frontend uses:
- **DOM manipulation** via `document.getElementById()` / `querySelector()`
- **Template literals** for HTML rendering (in `components.js`)
- **Chart.js** loaded from CDN (no build step)
- **CSS custom properties** for theming

### State management

All state is in `app.js` closure variables:
- `isScanning` — prevents concurrent scans
- `crawlReport` — stored crawl report for page switching
- `activePageIndex` — which crawl page is currently displayed
- `sseSource` — EventSource reference for crawl progress

### Component rendering pattern

Every component is a pure function: `render(container, data)` → sets `container.innerHTML`.
No virtual DOM. No diffing. Full re-render on each call.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`evaluateOnNewDocument`** for injection | Scripts must be injected BEFORE the page loads to catch all API calls from the start. `page.evaluate()` would miss early calls. |
| **`Proxy` + `Object.defineProperty`** for API interception | Non-destructive — doesn't break the page. Original API behavior is preserved while logging calls. |
| **CDP `Network.enable`** for requests | Puppeteer's `page.on('request')` only works when request interception is enabled, which can break pages. CDP events are passive. |
| **SSE (not WebSocket)** for crawl progress | Simpler, unidirectional, auto-reconnects. We only need server→client push. |
| **Single browser, new tab per page** | Cookies accumulate naturally across tabs (like a real user session). Using a new browser per page would lose state. |
| **Worst score = overall crawl score** | Conservative approach — the privacy of a site is only as good as its worst page. |
| **No database** | Simplicity — all results are ephemeral (in-memory). Add SQLite if persistent history is needed. |
| **Vanilla JS frontend** | No build step, no dependencies to update. The entire frontend is 4 static files. |

---

## Known Limitations

1. **Single concurrent scan** — Only one scan/crawl can run at a time (guarded by `activeScan` variable)
2. **No persistent storage** — Scan results are lost on page refresh. Could add SQLite or JSON file storage.
3. **No authentication support** — Cannot scan pages behind login. Could add support for connecting to an existing Chrome instance via `--remote-debugging-port`.
4. **JavaScript-only detection** — Analyzers only catch client-side data collection. Server-side tracking (HTTP headers, server logs) is not visible.
5. **Crawl depth limited** — Max depth 3 to prevent runaway crawls. Some sites have thousands of internal pages.
6. **Detection evasion** — Sophisticated trackers may detect headless Chrome and behave differently. The user-agent is set to a real Chrome string to mitigate this.
7. **No export** — Results cannot be exported to PDF/CSV yet. Could be added via an export endpoint.

---

## Environment Notes

- **macOS**: Node.js installed via Homebrew at `/opt/homebrew/bin/node`. May need `export PATH="/opt/homebrew/bin:$PATH"` before running.
- **Puppeteer** downloads its own Chromium binary during `npm install`. This can be 200+ MB.
- **Port 3000** is the default. Change via `PORT=8080 node server.js`.
- **Server startup**: `npm start` or `npm run dev` (auto-reload via `--watch`).
