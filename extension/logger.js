/**
 * logger.js
 * Provides standardized logging conforming to requirements.
 * Logs are prefixed and grouped.
 * They are also saved into chrome.storage.local under the 'logs' key.
 */

const Logger = {
  prefix: '[DataAnalyzer_Ext]',

  async _persistLog(level, message, data) {
    // In service workers and extension pages, we can use chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const { logs = [] } = await chrome.storage.local.get('logs');
        logs.push({
          timestamp: new Date().toISOString(),
          level,
          message,
          data: data ? JSON.stringify(data) : undefined,
        });
        // Keep only last 1000 logs
        if (logs.length > 1000) logs.shift();
        await chrome.storage.local.set({ logs });
      } catch (e) {
        // Ignore storage errors in logger to avoid infinite loops
      }
    }
  },

  info(message, data = null) {
    const formattedMessage = `${this.prefix} [INFO] ${message}`;
    if (data) {
      console.log(formattedMessage, data);
    } else {
      console.log(formattedMessage);
    }
    this._persistLog('INFO', message, data);
  },

  warn(message, data = null) {
    const formattedMessage = `${this.prefix} [WARN] ${message}`;
    if (data) {
      console.warn(formattedMessage, data);
    } else {
      console.warn(formattedMessage);
    }
    this._persistLog('WARN', message, data);
  },

  error(message, error = null) {
    const formattedMessage = `${this.prefix} [ERROR] ${message}`;
    if (error) {
      console.error(formattedMessage, error);
    } else {
      console.error(formattedMessage);
    }
    this._persistLog('ERROR', message, error);
  },
  
  debug(message, data = null) {
    const formattedMessage = `${this.prefix} [DEBUG] ${message}`;
    if (data) {
      console.debug(formattedMessage, data);
    } else {
      console.debug(formattedMessage);
    }
    // We typically don't persist debug logs to save storage space
  }
};

export default Logger;
