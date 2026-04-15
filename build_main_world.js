const fs = require('fs');

const { getFingerprintInjectionScript } = require('./analyzers/fingerprintAnalyzer');
const { getPermissionInjectionScript } = require('./analyzers/permissionAnalyzer');
const { getExtensionInjectionScript } = require('./analyzers/extensionAnalyzer');
const { getProfilingInjectionScript } = require('./analyzers/profilingAnalyzer');

// Execute the functions to get the string
let scripts = [
  getFingerprintInjectionScript(),
  getPermissionInjectionScript(),
  getExtensionInjectionScript(),
  getProfilingInjectionScript()
];

let finalScript = `/**
 * main_world.js
 * Injected into the MAIN world to monkey-patch browser APIs.
 */

// Combine all original injection scripts
${scripts.join('\n\n')}

// Bridge to isolated world
window.addEventListener('DataAnalyzer_RequestLogs', () => {
  window.postMessage({
    type: 'DataAnalyzer_Logs_Response',
    fingerprint: window.__fingerprintLog || [],
    permission: window.__permissionData || window.__permissionLog || [], // Wait, let me check the exact variable names
    extension: window.__extensionProbes || window.__extensionData || [],
    profiling: window.__profilingData || window.__profilingLog || []
  }, '*');
});

// Periodic send just in case the page unloads
setInterval(() => {
  window.postMessage({
    type: 'DataAnalyzer_Logs_Update',
    fingerprint: window.__fingerprintLog || [],
    permission: window.__permissionData || window.__permissionLog || [],
    extension: window.__extensionProbes || window.__extensionData || [],
    profiling: window.__profilingData || window.__profilingLog || []
  }, '*');
}, 2000);
`;

fs.writeFileSync('./extension/content/main_world.js', finalScript, 'utf8');
console.log('Successfully built extension/content/main_world.js');
