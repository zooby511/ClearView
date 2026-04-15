# 🔒 Chrome Website Data Analyzer

A comprehensive privacy audit tool that connects to Chrome and reveals exactly what data websites collect from your browser — cookies, trackers, fingerprinting, behavioral profiling, extension probing, and more.

![Dashboard](https://img.shields.io/badge/dashboard-dark%20theme-0a0e1a?style=flat-square) ![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## ✨ Features

### 🍪 Cookie Analysis
- Identifies every cookie set by a website
- Classifies cookies as **first-party** vs **third-party**
- Detects known **tracking cookies** (Google Analytics, Facebook, DoubleClick, etc.)
- Shows expiry, flags (Secure, HttpOnly, SameSite), and size

### 👁️ Tracker Detection
- Matches network requests against a database of **100+ known tracker domains**
- Categorizes trackers: Analytics, Advertising, Social Media, CDN, Tag Managers, Fingerprinting
- Shows request counts per tracker domain

### 📡 Network Request Monitoring
- Captures **every HTTP request** made by the page via Chrome DevTools Protocol (CDP)
- Classifies requests by type (Script, Image, XHR, Fetch, Stylesheet, etc.)
- Identifies all third-party domains contacted
- Visualizes data with interactive Chart.js charts

### 🔍 Browser Fingerprinting Detection
- Intercepts calls to sensitive browser APIs used for fingerprinting:
  - **Canvas** — `toDataURL()`, `getImageData()`
  - **WebGL** — `getParameter()`, `getExtension()`
  - **Audio** — `createOscillator()`, `createAnalyser()`
  - **Navigator** — `userAgent`, `hardwareConcurrency`, `deviceMemory`
  - **Screen** — `width`, `height`, `colorDepth`
  - **Battery** — `getBattery()`
  - **Network** — `connection.effectiveType`
- Calculates a **fingerprint risk score** (0-100) based on API usage

### 🔑 Permission Monitoring
- Detects when sites request sensitive permissions:
  - Geolocation, Camera, Microphone, Notifications, Clipboard, MIDI, Bluetooth, USB, and more
- Classifies each permission by risk level (Low / Medium / High)

### 🧩 Extension Fingerprinting
- Detects when websites try to probe your installed browser extensions
- Monitors for:
  - **Web Accessible Resource** loading (fetch/XHR to `chrome-extension://` URLs)
  - **DOM scanning** for extension-injected elements
  - **Chrome runtime messaging** to known extension IDs
- Identifies **40+ popular extensions** (uBlock Origin, LastPass, MetaMask, Honey, React DevTools, etc.)

### 👤 User Profiling & Behavioral Tracking
- Detects 10 categories of behavioral tracking:
  - **Keystroke logging** — keydown/keyup/keypress listeners
  - **Mouse tracking** — movement, click, scroll monitoring
  - **Clipboard interception** — copy/cut/paste events
  - **Form monitoring** — input/change/blur on form fields before submission
  - **Tab visibility** — focus/blur, visibility change tracking
  - **Exit intent** — beforeunload event monitoring
  - **Social login detection** — hidden iframes to detect social accounts
  - **Link decoration** — UTM params, fbclid, gclid on outbound links
  - **User ID tracking** — persistent identifiers in localStorage
  - **Navigation manipulation** — pushState/replaceState monitoring
- Calculates a **profiling intensity score** (Minimal / Low / Moderate / Aggressive)

### 🕷️ Deep Crawl Mode
- Crawls **multiple pages** of a website (not just the landing page)
- BFS link discovery with configurable **max pages** (3-20) and **depth** (up to 2)
- **Real-time SSE progress** — watch pages being scanned live
- **Aggregated results** — unified view across all crawled pages
- **New findings detection** — highlights data collection unique to each page vs. the landing page
- **Page switching** — click any crawled page to view its individual results

### 🛡️ Privacy Score
- Calculates an overall score from **0 (worst) to 100 (best)** with letter grades (A through F)
- Score factors: third-party cookies, tracker domains, fingerprinting risk, permission requests, extension probing, user profiling intensity

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18 (check with `node --version`)
- **npm** (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd ChromeWebsiteCookieAndDataAnalysis

# Install dependencies
npm install
```

This installs:
- **express** — web server for the dashboard and API
- **puppeteer** — headless Chrome for scanning (automatically downloads Chromium)

### 🚀 Chrome Extension Mode (New!)

This tool has been ported into a fully native Chrome Extension (Manifest V3) to scan websites securely directly from your browser. 
Deep Crawl is disabled in the extension mode, but all active tab analysis runs instantly.

**Installation from Source:**
1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button.
4. Select the `extension/` directory from this repository.
5. Pin the 🔒 Data Analyzer extension to your toolbar.

**Usage:**
1. Navigate to any website.
2. Click the extension icon.
3. Click **Scan Current Tab**.
4. The extension will open a new tab with the dashboard report.

### 💻 Node.js Server Mode (Legacy)

```bash
# Start the server
npm start

# Or with auto-reload during development
npm run dev
```

The dashboard will be available at **http://localhost:3000**

### Using the Tool

1. Open **http://localhost:3000** in your browser
2. Enter a website URL (e.g., `reddit.com`)
3. Choose a scan duration (5-30 seconds — longer = more trackers detected)
4. **(Optional)** Enable **🕷️ Deep Crawl** and set max pages to scan internal pages
5. Click **Scan Website**
6. View the comprehensive privacy report

---

## 📸 Screenshots

### Dashboard Welcome
The landing page shows all analysis capabilities with a clean, premium dark UI.

### Single-Page Scan Results
After scanning, you get summary cards, a privacy score ring, and detailed breakdowns for cookies, network requests, fingerprinting, storage, permissions, extension probing, and user profiling.

### Deep Crawl Progress
Real-time progress panel showing each page being scanned with live status updates and scores.

### Deep Crawl Report
Aggregated results across all crawled pages with clickable page cards showing per-page scores and "new findings" badges.

---

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | Server port (set via `PORT` env variable) |
| Scan Duration | `10s` | How long to wait for tracking scripts per page |
| Max Pages (Crawl) | `10` | Maximum pages to crawl in deep crawl mode |
| Max Depth (Crawl) | `2` | How many link levels deep to crawl |

---

## 📁 Project Structure

```
ChromeWebsiteCookieAndDataAnalysis/
├── server.js                          # Express server + scan/crawl orchestration
├── package.json                       # Dependencies (express, puppeteer)
├── analyzers/                         # Backend analysis modules
│   ├── cookieAnalyzer.js              # Cookie collection & classification
│   ├── storageAnalyzer.js             # localStorage, sessionStorage, IndexedDB
│   ├── networkAnalyzer.js             # CDP network request monitoring
│   ├── fingerprintAnalyzer.js         # Browser API fingerprinting detection
│   ├── permissionAnalyzer.js          # Permission request interception
│   ├── extensionAnalyzer.js           # Extension probing detection
│   ├── profilingAnalyzer.js           # Behavioral tracking detection
│   ├── trackerDatabase.js             # 100+ known tracker domain database
│   └── crawlAnalyzer.js              # Link discovery, crawl queue, aggregation
├── public/                            # Frontend (served statically)
│   ├── index.html                     # Dashboard HTML
│   ├── css/
│   │   └── styles.css                 # Premium dark theme styling
│   └── js/
│       ├── app.js                     # Main application logic
│       ├── components.js              # UI component renderers
│       └── charts.js                  # Chart.js visualizations
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scan` | Single-page scan. Body: `{ url, duration }` |
| `POST` | `/api/crawl` | Multi-page crawl. Body: `{ url, duration, maxPages, maxDepth }` |
| `GET` | `/api/crawl/progress` | SSE stream for real-time crawl progress |
| `GET` | `/api/status` | Check if a scan is currently running |

---

## 🛠️ Troubleshooting

### "Scan failed" / Puppeteer errors
- Make sure no other instance is running on port 3000
- Try running with `--no-sandbox`: the server already sets this flag
- On macOS, Puppeteer needs permission to download Chromium — run `npm install` first

### Slow scans
- Reduce the scan duration to 5 seconds for faster results
- In deep crawl mode, reduce max pages to 3-5

### "A scan is already in progress"
- Only one scan/crawl can run at a time. Wait for the current one to finish.

---

## 📄 License

MIT
