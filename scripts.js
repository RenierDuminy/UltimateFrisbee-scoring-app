/**
 * Reload-Proof Scorekeeping Application
 * Enhanced with comprehensive state persistence
 */

// =====================================================
// CONSTANTS AND CONFIGURATION
// =====================================================
const CONFIG = {

  API_URL: "https://docs.google.com/spreadsheets/d/1mhuN_H1C_DZ26r1NQRf4muQwszSd8F9mCfyWF5Iwjjo/export?format=csv&gid=884172048",
  SUBMIT_URL: "https://script.google.com/macros/s/AKfycbwDvvk2APZBToiqJ9D0FQQX2KlSbH5lZcfYOT4qTJnwiQjSSEUDlUD5WHZGv5eHJ2mk/exec",
  DEFAULT_TIMER_MINUTES: 100,
  LOADING_ANIMATION_INTERVAL: 500,
  AUTO_SAVE_INTERVAL: 2000, // Auto-save every 2 seconds
  HALFTIME_SCORE_TARGET: 8, // Trigger halftime once a single team reaches this score
  STORAGE_KEYS: {
    SCORE_LOGS: 'scoreLogs',
    TIMER_END_TIME: 'timerEndTime',
    TIMER_RUNNING: 'timerRunning',
    GAME_STATE: 'gameState',
    TEAMS_DATA: 'teamsData',
    LAST_SAVE: 'lastSave'
  }
};

const SPECIAL_OPTIONS = {
  NA: 'N/A',
  CALLAHAN: '‼CALLAHAN‼',
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
const Utils = {
  /**
   * Safe JSON parse with fallback
   */
  safeJsonParse: (str, fallback = null) => {
    try {
      return JSON.parse(str) || fallback;
    } catch (e) {
      console.warn('JSON parse failed:', e);
      return fallback;
    }
  },

  /**
   * Debounce function to limit rapid function calls
   */
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Show user notification
   */
  showNotification: (message, type = 'info') => {
    if (type === 'error') {
      console.error(message);
      alert(`Error: ${message}`);
    } else {
      console.log(message);
      if (type === 'success') {
        const successEl = document.getElementById('successMessage');
        if (successEl) {
          successEl.textContent = message;
          successEl.style.display = 'block';
          setTimeout(() => {
            successEl.style.display = 'none';
          }, 5000);
        }
      }
    }
  },

  /**
   * Create DOM element with attributes and content
   */
  createElement: (tag, attributes = {}, content = '') => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    if (content) element.textContent = content;
    return element;
  },

  /**
   * Generate unique ID
   */
  generateId: () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Sanitize a string for safe filenames
   */
  sanitizeFilename: (name, fallback = 'Game') => {
    const base = (name || '').toString().trim() || fallback;
    // Replace invalid filename chars and trim length
    return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 120);
  },

  /**
   * Convert array of fields to a CSV line with proper escaping
   */
  toCSVLine: (fields) => {
    return fields.map((v) => {
      let s = (v === null || v === undefined) ? '' : String(v);
      if (/[",\n\r]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  },

  /**
   * Download text content as a file on the client
   */
  downloadTextFile: (filename, text, mime = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Parse CSV text into array of rows (handles quoted commas)
   */
  parseCSV: (text) => {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell);
        cell = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (cell !== '' || row.length > 0) {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = '';
        }
      } else {
        if (char !== '\r') cell += char; // ignore stray CR
      }
    }

    // push last cell/row if any
    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  },

  /**
   * Convert CSV rows (first row team names) to { teamName: [players] }
   */
  csvToTeamsMap: (rows) => {
    if (!rows || rows.length === 0) return {};
    const header = rows[0].map(h => (h || '').trim()).filter(Boolean);
    const teams = {};
    header.forEach((teamName, colIdx) => {
      const players = [];
      for (let r = 1; r < rows.length; r++) {
        const val = (rows[r][colIdx] || '').trim();
        if (val) players.push(val);
      }
      teams[teamName] = players;
    });
    return teams;
  }
};

// =====================================================
// PERSISTENCE MANAGER - Handles all data persistence
// =====================================================
class PersistenceManager {
  constructor() {
    this.autoSaveInterval = null;
    this.lastSaveTime = 0;
  }

  /**
   * Save data to localStorage with error handling
   */
  saveToStorage(key, data) {
    try {
      const serializedData = JSON.stringify(data);
      localStorage.setItem(key, serializedData);
      this.lastSaveTime = Date.now();
      localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_SAVE, this.lastSaveTime.toString());
      return true;
    } catch (error) {
      console.error(`Failed to save ${key}:`, error);
      // Try to free up space by removing old data
      this.cleanupOldData();
      try {
        const serializedData = JSON.stringify(data);
        localStorage.setItem(key, serializedData);
        return true;
      } catch (retryError) {
        console.error(`Retry failed for ${key}:`, retryError);
        return false;
      }
    }
  }

  /**
   * Load data from localStorage
   */
  loadFromStorage(key, fallback = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      return fallback;
    }
  }

  /**
   * Save complete game state
   */
  saveGameState(gameState) {
    return this.saveToStorage(CONFIG.STORAGE_KEYS.GAME_STATE, {
      ...gameState,
      timestamp: Date.now()
    });
  }

  /**
   * Load complete game state
   */
  loadGameState() {
    const defaultState = {
      teamAScore: 0,
      teamBScore: 0,
      teamAName: '',
      teamBName: '',
      teamAPlayers: '',
      teamBPlayers: '',
      gameTime: '',
      matchDuration: CONFIG.DEFAULT_TIMER_MINUTES,
      halftimeDuration: 55,
      halftimeBreakDuration: 7,
      timeoutDuration: 75,
      timeoutsTotal: 2,
      timeoutsPerHalf: 0,
      abbaStart: 'M',
      stoppageActive: false,
      timeoutState: {
        A: { totalRemaining: 2, halfRemaining: 2 },
        B: { totalRemaining: 2, halfRemaining: 2 }
      },
      halftimeReasonResolved: null,
      scoreLogs: [],
      matchStarted: false,
      timestamp: Date.now()
    };

    return this.loadFromStorage(CONFIG.STORAGE_KEYS.GAME_STATE, defaultState);
  }

  /**
   * Save teams data with expiration
   */
  saveTeamsData(teamsData) {
    const dataWithExpiry = {
      data: teamsData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    return this.saveToStorage(CONFIG.STORAGE_KEYS.TEAMS_DATA, dataWithExpiry);
  }

  /**
   * Load teams data (check expiration)
   */
  loadTeamsData() {
    const storedData = this.loadFromStorage(CONFIG.STORAGE_KEYS.TEAMS_DATA);
    
    if (!storedData) return null;
    
    // Check if data has expired
    if (Date.now() > storedData.expiresAt) {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.TEAMS_DATA);
      return null;
    }
    
    return storedData.data;
  }

  /**
   * Start auto-save functionality
   */
  startAutoSave(saveCallback) {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      if (typeof saveCallback === 'function') {
        saveCallback();
      }
    }, CONFIG.AUTO_SAVE_INTERVAL);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Clean up old data to free space
   */
  cleanupOldData() {
    try {
      // Remove expired teams data
      const teamsData = this.loadFromStorage(CONFIG.STORAGE_KEYS.TEAMS_DATA);
      if (teamsData && Date.now() > teamsData.expiresAt) {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TEAMS_DATA);
      }

      // Remove very old game states (older than 7 days)
      const gameState = this.loadFromStorage(CONFIG.STORAGE_KEYS.GAME_STATE);
      if (gameState && gameState.timestamp && (Date.now() - gameState.timestamp) > (7 * 24 * 60 * 60 * 1000)) {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.GAME_STATE);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  /**
   * Get storage usage info
   */
  getStorageInfo() {
    let totalSize = 0;
    let itemCount = 0;

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length;
        itemCount++;
      }
    }

    return {
      totalSize: totalSize,
      itemCount: itemCount,
      lastSave: this.loadFromStorage(CONFIG.STORAGE_KEYS.LAST_SAVE)
    };
  }

  /**
   * Clear all app data
   */
  clearAllData() {
    Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    sessionStorage.clear();
  }
}

// =====================================================
// DATA MANAGER - Enhanced with persistence
// =====================================================
class DataManager {
  constructor(persistenceManager) {
    this.persistenceManager = persistenceManager;
    this.teamsData = {};
    this.scoreLogs = [];
    this.gameState = {};
    this.isDirty = false; // Track if data needs saving
    
    this.loadAllData();
  }

  /**
   * Load all persisted data
   */
  loadAllData() {
    // Load game state
    this.gameState = this.persistenceManager.loadGameState();
    this.scoreLogs = this.gameState.scoreLogs || [];
    
    // Load teams data
    const cachedTeamsData = this.persistenceManager.loadTeamsData();
    if (cachedTeamsData) {
      this.teamsData = cachedTeamsData;
    }
  }

  /**
   * Save current state
   */
  saveCurrentState() {
    if (!this.isDirty) return;

    const success = this.persistenceManager.saveGameState(this.gameState);
    if (success) {
      this.isDirty = false;
    }
    return success;
  }

  /**
   * Mark data as dirty (needs saving)
   */
  markDirty() {
    this.isDirty = true;
  }

  /**
   * Update game state
   */
  updateGameState(updates) {
    Object.assign(this.gameState, updates);
    this.markDirty();
  }

  /**
   * Add new score log
   */
  addScoreLog(logEntry) {
    this.scoreLogs.push(logEntry);
    this.gameState.scoreLogs = this.scoreLogs;
    this.markDirty();
  }

  /**
   * Update existing score log
   */
  updateScoreLog(scoreID, updates) {
    const index = this.scoreLogs.findIndex(log => log.scoreID === scoreID);
    if (index !== -1) {
      Object.assign(this.scoreLogs[index], updates);
      this.gameState.scoreLogs = this.scoreLogs;
      this.markDirty();
      return true;
    }
    return false;
  }

  /**
   * Get score log by ID
   */
  getScoreLog(scoreID) {
    return this.scoreLogs.find(log => log.scoreID === scoreID);
  }

  /**
   * Clear all score logs
   */
  clearScoreLogs() {
    this.scoreLogs = [];
    this.gameState.scoreLogs = [];
    this.markDirty();
  }

  /**
   * Get teams data
   */
  getTeamsData() {
    return this.teamsData;
  }

  /**
   * Set teams data
   */
  setTeamsData(data) {
    this.teamsData = data || {};
    this.persistenceManager.saveTeamsData(this.teamsData);
  }

  /**
   * Remove a score log by ID
   */
  removeScoreLog(scoreID) {
    const index = this.scoreLogs.findIndex(log => log.scoreID === scoreID);
    if (index === -1) return null;
    const [removed] = this.scoreLogs.splice(index, 1);
    this.gameState.scoreLogs = this.scoreLogs;
    this.markDirty();
    return removed;
  }

  /**
   * Get current game state
   */
  getGameState() {
    return this.gameState;
  }

  /**
   * Reset game state
   */
  resetGameState() {
    this.gameState = {
      teamAScore: 0,
      teamBScore: 0,
      teamAName: '',
      teamBName: '',
      teamAPlayers: '',
      teamBPlayers: '',
      gameTime: '',
      matchDuration: CONFIG.DEFAULT_TIMER_MINUTES,
      halftimeDuration: 55,
      halftimeBreakDuration: 7,
      timeoutDuration: 75,
      timeoutsTotal: 2,
      timeoutsPerHalf: 0,
      abbaStart: 'M',
      stoppageActive: false,
      timeoutState: {
        A: { totalRemaining: 2, halfRemaining: 2 },
        B: { totalRemaining: 2, halfRemaining: 2 }
      },
      halftimeReasonResolved: null,
      scoreLogs: [],
      matchStarted: false,
      timestamp: Date.now()
    };
    this.scoreLogs = [];
    this.markDirty();
  }
}

// =====================================================
// API MANAGER - Same as before
// =====================================================
class ApiManager {
  constructor() {
    this.teamsUrl = CONFIG.API_URL;
    this.submitUrl = CONFIG.SUBMIT_URL;
  }

  async fetchTeams() {
    try {
      const response = await fetch(this.teamsUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Try to parse as JSON first in case API_URL points to JSON
      const contentType = response.headers.get('Content-Type') || '';
      const isLikelyJson = contentType.includes('application/json') || this.teamsUrl.endsWith('.json');

      if (isLikelyJson) {
        const data = await response.json();
        return data || {};
      }

      // Otherwise parse CSV into { teamName: [players] }
      const text = await response.text();
      const rows = Utils.parseCSV(text);
      const teams = Utils.csvToTeamsMap(rows);
      return teams;
    } catch (error) {
      console.error("Error fetching teams:", error);
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }
  }

  async submitScores(dataToSend) {
    try {
      if (!this.submitUrl) {
        console.warn('SUBMIT_URL is not configured; skipping export.');
        return false;
      }

      const response = await fetch(this.submitUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });

      // With no-cors we can't read response; assume success
      return true;
    } catch (error) {
      console.error("Error submitting scores:", error);
      throw new Error(`Failed to submit scores: ${error.message}`);
    }
  }
}

// =====================================================
// REVAMPED TIMER MANAGER - Simple countdown from future date
// =====================================================
class TimerManager {
  constructor(persistenceManager) {
    this.persistenceManager = persistenceManager;
    this.timerInterval = null;
    this.isRunning = false;
    this.endTime = null;
    this.remainingTimeMs = null; // Store remaining time when paused
    this.defaultMinutes = CONFIG.DEFAULT_TIMER_MINUTES;
    this.tickCallback = null;
    
    this.loadTimerState();
  }


  /**
   * Get time remaining until endTime
   */
  getTimeRemaining(endtime) {
    const total = Date.parse(endtime) - Date.parse(new Date());
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor(total / 1000 / 60);
    
    return {
      total,
      minutes,
      seconds
    };
  }

  /**
   * Load saved timer state
   */
  loadTimerState() {
    const storedEndTime = this.persistenceManager.loadFromStorage('timerEndTime');
    const storedIsRunning = this.persistenceManager.loadFromStorage(CONFIG.STORAGE_KEYS.TIMER_RUNNING);
    const storedRemainingTime = this.persistenceManager.loadFromStorage('timerRemainingTime');

    if (storedEndTime) {
      this.endTime = new Date(storedEndTime);
    }

    if (storedRemainingTime) {
      this.remainingTimeMs = parseInt(storedRemainingTime, 10);
    }

    this.isRunning = (storedIsRunning === true || storedIsRunning === 'true');

    // Check if timer should still be running
    if (this.isRunning && this.endTime) {
      const timeRemaining = this.getTimeRemaining(this.endTime);
      if (timeRemaining.total <= 0) {
        // Timer expired while away
        this.stop();
        this.updateDisplay();
      } else {
        // Resume timer
        this.start();
      }
    } else if (this.remainingTimeMs !== null) {
      // Timer was paused, restore remaining time
      this.setRemainingTime(this.remainingTimeMs);
      this.updateDisplay();
    } else {
      // Initialize with default time if no saved state
      this.reset(this.defaultMinutes);
    }
  }

  /**
   * Save timer state to storage
   */
  saveTimerState() {
    this.persistenceManager.saveToStorage('timerEndTime', this.endTime ? this.endTime.toISOString() : null);
    this.persistenceManager.saveToStorage(CONFIG.STORAGE_KEYS.TIMER_RUNNING, this.isRunning);
    this.persistenceManager.saveToStorage('timerRemainingTime', this.remainingTimeMs);
  }

  /**
   * Set remaining time from milliseconds
   */
  setRemainingTime(milliseconds) {
    this.remainingTimeMs = milliseconds;
    // Set endTime to null when paused to indicate we're using remainingTimeMs
    this.endTime = null;
  }

  /**
   * Update the timer display
   */
  updateDisplay() {
    const timerDisplay = document.getElementById('timerDisplay');
    
    if (!timerDisplay) return;

    let timeRemaining;
    
    if (this.isRunning && this.endTime) {
      // Timer is running, calculate from endTime
      timeRemaining = this.getTimeRemaining(this.endTime);
    } else if (this.remainingTimeMs !== null) {
      // Timer is paused, use stored remaining time
      const total = this.remainingTimeMs;
      const seconds = Math.floor((total / 1000) % 60);
      const minutes = Math.floor(total / 1000 / 60);
      timeRemaining = { total, minutes, seconds };
    } else {
      // Fallback to default time
      const total = this.defaultMinutes * 60 * 1000;
      const seconds = 0;
      const minutes = this.defaultMinutes;
      timeRemaining = { total, minutes, seconds };
    }

    const absMinutes = Math.abs(timeRemaining.minutes);
    const absSeconds = Math.abs(timeRemaining.seconds);
    
    const mins = absMinutes.toString().padStart(2, '0');
    const secs = absSeconds.toString().padStart(2, '0');

    let timeString = `${mins}:${secs}`;

    if (timeRemaining.total < 0) {
      timeString = `-${timeString}`;
      timerDisplay.classList.add('timer-negative');
    } else {
      timerDisplay.classList.remove('timer-negative');
    }

    timerDisplay.textContent = timeString;
    
    // Update game time field if it exists
    const timeInput = document.getElementById('time');
    if (timeInput) {
      timeInput.value = new Date().toLocaleString();
    }
  }

  /**
   * Start the timer
   */
  start() {
    if (this.isRunning) return;
    
    // If we have remaining time (from pause), set new end time based on it
    if (this.remainingTimeMs !== null) {
      this.endTime = new Date(Date.now() + this.remainingTimeMs);
      this.remainingTimeMs = null; // Clear since we're now running
    }
    
    // If we still don't have an end time, set default
    if (!this.endTime) {
      this.endTime = new Date(Date.now() + (this.defaultMinutes * 60 * 1000));
    }
    
    this.isRunning = true;
    this.updateUI();
    this.saveTimerState();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      this.updateDisplay();
      
      const timeRemaining = this.getTimeRemaining(this.endTime);
      if (typeof this.tickCallback === 'function') {
        try {
          this.tickCallback({ ...timeRemaining });
        } catch (err) {
          console.error('Timer tick callback error:', err);
        }
      }
      if (timeRemaining.total <= 0 && this.isRunning) {
        this.stop();
      }
    }, 1000);

    // Initial update
    this.updateDisplay();
    if (typeof this.tickCallback === 'function' && this.endTime) {
      try {
        const initialRemaining = this.getTimeRemaining(this.endTime);
        this.tickCallback({ ...initialRemaining });
      } catch (err) {
        console.error('Timer tick callback error:', err);
      }
    }
  }

  /**
   * Stop/Pause the timer
   */
  stop() {
    if (!this.isRunning) return;
    
    // Store remaining time when pausing
    if (this.endTime) {
      const timeRemaining = this.getTimeRemaining(this.endTime);
      this.remainingTimeMs = Math.max(0, timeRemaining.total); // Don't store negative time
    }
    
    this.isRunning = false;
    this.endTime = null; // Clear endTime when paused
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this.updateUI();
    this.saveTimerState();
    this.updateDisplay(); // Update display to show paused time
  }

  /**
   * Toggle timer play/pause
   */
  toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  setTickCallback(callback) {
    this.tickCallback = (typeof callback === 'function') ? callback : null;
  }

  /**
   * Reset timer to specified minutes
   */
  reset(minutes = this.defaultMinutes) {
    this.stop();
    
    // Set remaining time and clear endTime
    this.remainingTimeMs = minutes * 60 * 1000;
    this.endTime = null;
    
    this.saveTimerState();
    this.updateDisplay();
    this.updateUI();
  }

  /**
   * Update UI elements
   */
  updateUI() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const timerColumn = document.getElementById('timerColumn');
    
    if (playPauseBtn) {
      playPauseBtn.textContent = this.isRunning ? "Pause" : "Play";
    }
    
    if (timerColumn) {
      timerColumn.classList.toggle('timer-running', this.isRunning);
      timerColumn.classList.toggle('timer-paused', !this.isRunning);
    }
  }

  /**
   * Get remaining time in seconds (for debugging/external use)
   */
  getRemainingSeconds() {
    if (this.isRunning && this.endTime) {
      const timeRemaining = this.getTimeRemaining(this.endTime);
      return Math.floor(timeRemaining.total / 1000);
    } else if (this.remainingTimeMs !== null) {
      return Math.floor(this.remainingTimeMs / 1000);
    }
    return 0;
  }
}

// =====================================================
// SECONDS TIMER MANAGER - Simple second-based countdown
// =====================================================
class SecondsTimerManager {
  constructor() {
    this.timerInterval = null;
    this.isRunning = false;
    this.endTime = null;
    this.remainingTimeMs = null;
    this.defaultSeconds = 75;
    this.updateDisplay();
  }

  // Start countdown using current remaining or default
  start() {
    if (this.isRunning) return;
    if (this.remainingTimeMs === null) {
      const secondsInput = document.getElementById('countdownTimeSec');
      const secs = parseInt(secondsInput?.value, 10) || this.defaultSeconds;
      this.remainingTimeMs = secs * 1000;
    }
    this.endTime = new Date(Date.now() + this.remainingTimeMs);
    this.isRunning = true;
    this.timerInterval = setInterval(() => this.tick(), 200);
    this.updateUI();
  }

  // Stop countdown and keep remaining time
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    const timeRemaining = this.getTimeRemaining(this.endTime);
    this.remainingTimeMs = Math.max(0, timeRemaining.total);
    this.endTime = null;
    this.updateUI();
  }

  toggle() { this.isRunning ? this.stop() : this.start(); }

  reset(seconds = this.defaultSeconds) {
    this.stop();
    const secs = Math.max(1, parseInt(seconds, 10) || this.defaultSeconds);
    this.remainingTimeMs = secs * 1000;
    this.updateDisplay();
  }

  getTimeRemaining(endtime) {
    const total = Date.parse(endtime) - Date.parse(new Date());
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor(total / 1000 / 60);
    return { total, minutes, seconds };
  }

  tick() {
    const timeRemaining = this.getTimeRemaining(this.endTime);
    this.updateDisplay(timeRemaining);
    if (timeRemaining.total <= 0) {
      this.stop();
      this.remainingTimeMs = 0;
    }
  }

  updateUI() {
    const playPauseBtn = document.getElementById('playPauseSecBtn');
    const timerColumn = document.getElementById('timerColumnSec');
    if (playPauseBtn) playPauseBtn.textContent = this.isRunning ? 'Pause' : 'Play';
    if (timerColumn) {
      timerColumn.classList.toggle('timer-running', this.isRunning);
      timerColumn.classList.toggle('timer-paused', !this.isRunning);
    }
  }

  updateDisplay(existing) {
    const timerDisplay = document.getElementById('timerDisplaySec');
    if (!timerDisplay) return;

    let timeRemaining = existing;
    if (!timeRemaining) {
      if (this.isRunning && this.endTime) {
        timeRemaining = this.getTimeRemaining(this.endTime);
      } else if (this.remainingTimeMs !== null) {
        const total = this.remainingTimeMs;
        const seconds = Math.floor((total / 1000) % 60);
        const minutes = Math.floor(total / 1000 / 60);
        timeRemaining = { total, minutes, seconds };
      } else {
        const total = this.defaultSeconds * 1000;
        const minutes = Math.floor(this.defaultSeconds / 60);
        const seconds = this.defaultSeconds % 60;
        timeRemaining = { total, minutes, seconds };
      }
    }

    const mins = Math.max(0, timeRemaining.minutes).toString().padStart(2, '0');
    const secs = Math.max(0, timeRemaining.seconds).toString().padStart(2, '0');
    timerDisplay.textContent = `${mins}:${secs}`;
  }
}

// =====================================================
// LOADING MANAGER - Same as before
// =====================================================
class LoadingManager {
  constructor() {
    this.loadingInterval = null;
  }

  start() {
    const loadingAnimation = document.getElementById('loadingAnimation');
    const dots = document.getElementById('dots');
    
    if (!loadingAnimation || !dots) return;

    let dotCount = 0;
    loadingAnimation.style.display = 'block';
    
    this.loadingInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      dots.textContent = '.'.repeat(dotCount);
    }, CONFIG.LOADING_ANIMATION_INTERVAL);
  }

  stop() {
    const loadingAnimation = document.getElementById('loadingAnimation');
    const dots = document.getElementById('dots');
    
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    
    if (loadingAnimation) loadingAnimation.style.display = 'none';
    if (dots) dots.textContent = '';
  }
}

// =====================================================
// MAIN APPLICATION CLASS - Enhanced with state restoration
// =====================================================
class ScorekeeperApp {
  constructor() {
    // Initialize managers
    this.persistenceManager = new PersistenceManager();
    this.dataManager = new DataManager(this.persistenceManager);
    this.apiManager = new ApiManager();
    this.loadingManager = new LoadingManager();
    this.timerManager = new TimerManager(this.persistenceManager);
    this.secondsTimer = new SecondsTimerManager();

    this.gameSettings = {
      matchDuration: CONFIG.DEFAULT_TIMER_MINUTES,
      halftimeDuration: 55,
      halftimeBreakDuration: 7,
      timeoutDuration: 75,
      timeoutsTotal: 2,
      timeoutsPerHalf: 0
    };

    this.timeoutState = {
      A: {
        totalRemaining: this.gameSettings.timeoutsTotal,
        halfRemaining: this.gameSettings.timeoutsPerHalf || this.gameSettings.timeoutsTotal
      },
      B: {
        totalRemaining: this.gameSettings.timeoutsTotal,
        halfRemaining: this.gameSettings.timeoutsPerHalf || this.gameSettings.timeoutsTotal
      }
    };
    
    // Application state
    this.teamAScore = 0;
    this.teamBScore = 0;
    this.currentEditID = null;
    this.currentTimeoutEditID = null;
    this.currentHalftimeEditID = null;
    this.halftimeTriggered = false;
    this.halftimeAutoSuppressed = false;
    this.halftimePendingReason = null;
    this.halftimeReasonResolved = null;
    this.isRestoring = false;
    this.abbaStart = 'M';
    this.matchStarted = false;
    this.gameStoppageActive = false;
    this.hardCapReached = false;
    this.stoppagePausedMainTimer = false;
    this.stoppagePausedSecondsTimer = false;
    this.tableResizeFrame = null;

    this.timerManager.defaultMinutes = this.gameSettings.matchDuration;
    this.secondsTimer.defaultSeconds = this.gameSettings.timeoutDuration;
    
    // Bind methods
    this.handleTeamChange = this.handleTeamChange.bind(this);
    this.handleSaveScore = this.handleSaveScore.bind(this);
    this.handleSubmitScore = this.handleSubmitScore.bind(this);
    this.handleDeleteScore = this.handleDeleteScore.bind(this);
    this.handleTimerToggle = this.handleTimerToggle.bind(this);
    this.handleTimerReset = this.handleTimerReset.bind(this);
    this.handleSecTimerToggle = this.handleSecTimerToggle.bind(this);
    this.handleSecTimerReset = this.handleSecTimerReset.bind(this);
    this.openPopup = this.openPopup.bind(this);
    this.closePopup = this.closePopup.bind(this);
    this.openSetupPopup = this.openSetupPopup.bind(this);
    this.closeSetupPopup = this.closeSetupPopup.bind(this);
    this.openTimePopup = this.openTimePopup.bind(this);
    this.closeTimePopup = this.closeTimePopup.bind(this);
    this.handleStoppageToggle = this.handleStoppageToggle.bind(this);
    this.handleSetupSave = this.handleSetupSave.bind(this);
    this.autoSave = this.autoSave.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleAbbaChange = this.handleAbbaChange.bind(this);
    this.startMatch = this.startMatch.bind(this);
    this.handleHalftime = this.handleHalftime.bind(this);
    this.openTimeoutEditPopup = this.openTimeoutEditPopup.bind(this);
    this.closeTimeoutEditPopup = this.closeTimeoutEditPopup.bind(this);
    this.handleTimeoutEditSave = this.handleTimeoutEditSave.bind(this);
    this.openHalftimeEditPopup = this.openHalftimeEditPopup.bind(this);
    this.closeHalftimeEditPopup = this.closeHalftimeEditPopup.bind(this);
    this.handleHalftimeDelete = this.handleHalftimeDelete.bind(this);
    this.handleMainTimerTick = this.handleMainTimerTick.bind(this);
    this.adjustScoringTableSizing = this.adjustScoringTableSizing.bind(this);
    this.handleResize = Utils.debounce(() => this.adjustScoringTableSizing(), 150);

    this.timerManager.setTickCallback(this.handleMainTimerTick);
  }

  /**
   * Initialize the application with state restoration
   */
  async init() {
    try {
      // Set up before unload handler
      window.addEventListener('beforeunload', this.handleBeforeUnload);
      
      // Start auto-save
      this.persistenceManager.startAutoSave(this.autoSave);
      
      // Show initial popups while data loads
      this.showLoadingPopup();

      let initializationError = null;
      try {
        // Check if we need to restore state
        await this.checkAndRestoreState();
        
        // Load teams data (from cache or API)
        await this.loadTeams();
      } catch (error) {
        initializationError = error;
      } finally {
        this.finishInitialLoading();
      }

      this.initializeTimeoutState(this.dataManager.getGameState()?.timeoutState);
      
      // Setup event listeners
      this.setupEventListeners();
      this.updateTeamsDisplay();

      this.applyGameSettingsToUI();
      this.setAbbaVisibility(this.abbaStart !== 'NONE');
      this.updateAbbaDisplay();
      const setupAbbaSelect = document.getElementById('setupAbba');
      if (setupAbbaSelect) setupAbbaSelect.value = this.abbaStart;
      this.updateMatchControls();
      this.updateStoppageUI();
      this.adjustScoringTableSizing();
      window.addEventListener('resize', this.handleResize);
      
      // Set up page visibility handler for mobile
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.autoSave();
        }
      });
      
      if (initializationError) {
        throw initializationError;
      }

      Utils.showNotification('Application initialized successfully', 'success');
    } catch (error) {
      Utils.showNotification(`Failed to initialize application: ${error.message}`, 'error');
    }
  }

  /**
   * Check and restore previous state
   */
  async checkAndRestoreState() {
    const gameState = this.dataManager.getGameState();
    
    // If we have a recent state (less than 24 hours old), restore it
    if (gameState.timestamp && (Date.now() - gameState.timestamp) < (24 * 60 * 60 * 1000)) {
      this.isRestoring = true;
      
      // Show restore notification
      const shouldRestore = confirm(
        'Previous game data found. Would you like to restore your previous session?'
      );
      
      if (shouldRestore) {
        await this.restoreGameState(gameState);
        Utils.showNotification('Previous session restored successfully', 'success');
      } else {
        this.dataManager.resetGameState();
        this.gameSettings = {
          matchDuration: CONFIG.DEFAULT_TIMER_MINUTES,
          halftimeDuration: 55,
          halftimeBreakDuration: 7,
          timeoutDuration: 75,
          timeoutsTotal: 2,
          timeoutsPerHalf: 0
        };
        this.applyGameSettingsToUI();
        this.abbaStart = 'M';
        this.setAbbaVisibility(true);
        this.updateAbbaDisplay();
        this.clearAbbaCells();
        this.gameStoppageActive = false;
        this.updateStoppageUI();
        this.updateTeamsDisplay();
        this.matchStarted = false;
        this.hardCapReached = false;
        this.updateMatchControls();
      }
      
      this.isRestoring = false;
    }
  }

  /**
   * Restore complete game state
   */
  async restoreGameState(gameState) {
    // Restore scores
    this.teamAScore = gameState.teamAScore || 0;
    this.teamBScore = gameState.teamBScore || 0;
    const storedMatchStarted = typeof gameState.matchStarted === 'boolean' ? gameState.matchStarted : null;
    this.matchStarted = storedMatchStarted !== null
      ? storedMatchStarted
      : Array.isArray(gameState.scoreLogs) && gameState.scoreLogs.length > 0;
    this.halftimeAutoSuppressed = false;
    const hasHalftimeLog = Array.isArray(gameState.scoreLogs)
      ? gameState.scoreLogs.some((log) => (log?.Type || '').toLowerCase() === 'halftime')
      : false;
    this.halftimeReasonResolved = hasHalftimeLog
      ? (gameState.halftimeReasonResolved || null)
      : null;
    
    // Restore team selections
    const teamASelect = document.getElementById('teamA');
    const teamBSelect = document.getElementById('teamB');
    
    if (teamASelect && gameState.teamAName) {
      teamASelect.value = gameState.teamAName;
    }
    if (teamBSelect && gameState.teamBName) {
      teamBSelect.value = gameState.teamBName;
    }
    
    // Restore player lists
    const teamAList = document.getElementById('teamAList');
    const teamBList = document.getElementById('teamBList');
    
    if (teamAList && gameState.teamAPlayers) {
      teamAList.value = gameState.teamAPlayers;
    }
    if (teamBList && gameState.teamBPlayers) {
      teamBList.value = gameState.teamBPlayers;
    }
    
    // Restore game time
    const timeInput = document.getElementById('time');
    if (timeInput && gameState.gameTime) {
      timeInput.value = gameState.gameTime;
    }
    
    // Restore score logs and rebuild table
    if (gameState.scoreLogs && gameState.scoreLogs.length > 0) {
      this.rebuildScoreTable(gameState.scoreLogs);
    }

    const numberOr = (value, fallback) => (typeof value === 'number' && !Number.isNaN(value) ? value : fallback);
    this.gameSettings.matchDuration = numberOr(gameState.matchDuration, CONFIG.DEFAULT_TIMER_MINUTES);
    this.gameSettings.halftimeDuration = numberOr(gameState.halftimeDuration, 55);
    this.gameSettings.halftimeBreakDuration = numberOr(gameState.halftimeBreakDuration, 7);
    this.gameSettings.timeoutDuration = numberOr(gameState.timeoutDuration, 75);
    this.gameSettings.timeoutsTotal = numberOr(gameState.timeoutsTotal, 2);
    this.gameSettings.timeoutsPerHalf = numberOr(gameState.timeoutsPerHalf, 0);
    this.applyGameSettingsToUI();

    // Restore ABBA start if present
    const storedAbba = gameState.abbaStart;
    if (storedAbba) {
      this.abbaStart = storedAbba === 'F' || storedAbba === 'NONE' ? storedAbba : 'M';
    } else {
      this.abbaStart = 'M';
    }
    this.setAbbaVisibility(this.abbaStart !== 'NONE');
    this.updateAbbaDisplay();
    this.gameStoppageActive = Boolean(gameState.stoppageActive);
    this.updateStoppageUI();
    if (this.gameStoppageActive) {
      this.pauseAllTimers();
    }
    if (this.abbaStart !== 'NONE') {
      this.updateAbbaColumn();
    } else {
      this.clearAbbaCells();
    }

    this.updateTeamsDisplay();
    this.updateMatchControls();
    this.checkForScoreCap({ silent: true });
    this.updateHalftimeTracking();
    this.halftimePendingReason = null;
    this.maybeTriggerHalftimeByScore();
    this.maybeTriggerHalftimeByTime();
  }

  /**
   * Rebuild score table from logs
   */
  rebuildScoreTable(scoreLogs) {
    const scoringTableBody = document.getElementById('scoringTableBody');
    if (!scoringTableBody) return;

    this.teamAScore = 0;
    this.teamBScore = 0;
    scoringTableBody.innerHTML = '';

    const logs = Array.isArray(scoreLogs) ? scoreLogs : this.dataManager.scoreLogs;
    let scoringIndex = 0;

    logs.forEach((logEntry) => {
      const isScore = this.isScoreLog(logEntry);
      let abbaIndex = null;
      if (isScore) {
        const teamLetter = this.getTeamLetterFromLog(logEntry);
        if (teamLetter === 'A') this.teamAScore++;
        else if (teamLetter === 'B') this.teamBScore++;
        abbaIndex = scoringIndex;
        scoringIndex++;
      }
      const row = this.createScoreRow(logEntry, abbaIndex);
      if (row) {
        if (scoringTableBody.firstChild) {
          scoringTableBody.insertBefore(row, scoringTableBody.firstChild);
        } else {
          scoringTableBody.appendChild(row);
        }
      }
    });

    this.updateAbbaColumn();
    this.setAbbaVisibility(this.abbaStart !== 'NONE');
    this.checkForScoreCap({ silent: true });
    this.updateHalftimeTracking();
    this.maybeTriggerHalftimeByScore();
    this.adjustScoringTableSizing();
  }

  /**
   * Auto-save current state
   */
  autoSave() {
    if (this.isRestoring) return;
    
    // Capture current UI state
    const currentState = {
      teamAScore: this.teamAScore,
      teamBScore: this.teamBScore,
      teamAName: document.getElementById('teamA')?.value || '',
      teamBName: document.getElementById('teamB')?.value || '',
      teamAPlayers: document.getElementById('teamAList')?.value || '',
      teamBPlayers: document.getElementById('teamBList')?.value || '',
      gameTime: document.getElementById('time')?.value || '',
      scoreLogs: this.dataManager.scoreLogs,
      abbaStart: this.abbaStart,
      stoppageActive: this.gameStoppageActive,
      matchDuration: this.gameSettings.matchDuration,
      halftimeDuration: this.gameSettings.halftimeDuration,
      halftimeBreakDuration: this.gameSettings.halftimeBreakDuration,
      timeoutDuration: this.gameSettings.timeoutDuration,
      timeoutsTotal: this.gameSettings.timeoutsTotal,
      timeoutsPerHalf: this.gameSettings.timeoutsPerHalf,
      timeoutState: this.getTimeoutStateSnapshot(),
      matchStarted: this.matchStarted,
      halftimeReasonResolved: this.halftimeReasonResolved,
      timestamp: Date.now()
    };
    
    this.dataManager.updateGameState(currentState);
    this.dataManager.saveCurrentState();
  }

  /**
   * Handle before page unload
   */
  handleBeforeUnload(event) {
    window.removeEventListener('resize', this.handleResize);
    if (this.tableResizeFrame) {
      cancelAnimationFrame(this.tableResizeFrame);
      this.tableResizeFrame = null;
    }

    // Perform final save
    this.autoSave();
    
    // If there's unsaved data, show warning
    if (this.dataManager.isDirty || this.dataManager.scoreLogs.length > 0) {
      const message = 'You have unsaved game data. Are you sure you want to leave?';
      event.returnValue = message;
      return message;
    }
  }

  /**
   * Load teams from API or cache
   */
  async loadTeams() {
    try {
      // Always fetch latest from API on launch
      await this.loadTeamsFromAPI();
    } catch (error) {
      console.warn('Primary team loading failed, attempting cache:', error);
      // Fallback to cached teams if available
      const cachedTeams = this.dataManager.getTeamsData();
      if (cachedTeams && Object.keys(cachedTeams).length > 0) {
        this.populateTeamOptions(cachedTeams);
        Utils.showNotification('Using cached team list due to network error.', 'info');
      } else {
        Utils.showNotification(`Failed to load teams: ${error.message}`, 'error');
        this.dataManager.setTeamsData({});
      }
    }
  }

  /**
   * Load teams from API
   */
  async loadTeamsFromAPI() {
    const teamsData = await this.apiManager.fetchTeams();
    this.dataManager.setTeamsData(teamsData);
    this.populateTeamOptions(teamsData);
  }

  /**
   * Populate team selection dropdowns
   */
  populateTeamOptions(teams) {
    const teamASelect = document.getElementById('teamA');
    const teamBSelect = document.getElementById('teamB');
    
    if (!teamASelect || !teamBSelect) return;

    // Store current selections
    const currentTeamA = teamASelect.value;
    const currentTeamB = teamBSelect.value;

    // Clear existing options except the first one
    teamASelect.innerHTML = '<option value="">Select Team A</option>';
    teamBSelect.innerHTML = '<option value="">Select Team B</option>';

    const teamNames = Object.keys(teams);
    
    // Create options for both selects
    teamNames.forEach(teamName => {
      const optionA = Utils.createElement('option', { value: teamName }, teamName);
      const optionB = Utils.createElement('option', { value: teamName }, teamName);
      
      teamASelect.appendChild(optionA);
      teamBSelect.appendChild(optionB);
    });

    // Restore previous selections
    if (currentTeamA) teamASelect.value = currentTeamA;
    if (currentTeamB) teamBSelect.value = currentTeamB;

    this.updateTeamsDisplay();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Team selection change handlers
    const teamASelect = document.getElementById('teamA');
    const teamBSelect = document.getElementById('teamB');
    
    if (teamASelect) {
      teamASelect.addEventListener('change', () => {
        this.handleTeamChange('teamA');
        this.autoSave();
      });
    }
    if (teamBSelect) {
      teamBSelect.addEventListener('change', () => {
        this.handleTeamChange('teamB');
        this.autoSave();
      });
    }

    // Auto-save on input changes
    const autoSaveInputs = ['teamAList', 'teamBList', 'time'];
    autoSaveInputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', Utils.debounce(this.autoSave, 1000));
      }
    });

    // Timer controls
    const playPauseBtn = document.getElementById('playPauseBtn');
    this.setupTimerButton(playPauseBtn, this.handleTimerToggle, this.handleTimerReset);

    // Seconds timer controls
    const playPauseSecBtn = document.getElementById('playPauseSecBtn');
    this.setupTimerButton(playPauseSecBtn, this.handleSecTimerToggle, this.handleSecTimerReset);

    const startMatchBtn = document.getElementById('startMatchBtn');
    if (startMatchBtn) {
      startMatchBtn.addEventListener('click', this.startMatch);
    }

    // Timeout controls
    const timeoutBtnA = document.getElementById('timeoutTeamA');
    const timeoutBtnB = document.getElementById('timeoutTeamB');
    if (timeoutBtnA) {
      timeoutBtnA.addEventListener('click', () => this.handleTimeout('A'));
    }
    if (timeoutBtnB) {
      timeoutBtnB.addEventListener('click', () => this.handleTimeout('B'));
    }

    const halfTimeBtn = document.getElementById('halfTimeBtn');
    if (halfTimeBtn) {
      halfTimeBtn.addEventListener('click', this.handleHalftime);
    }

    // Score buttons
    const addScoreTeamA = document.getElementById('addScoreTeamA');
    const addScoreTeamB = document.getElementById('addScoreTeamB');
    
    if (addScoreTeamA) {
      addScoreTeamA.addEventListener('click', () => {
        if (!this.matchStarted) {
          Utils.showNotification('Start the match before adding scores.', 'error');
          return;
        }
        this.openPopup('A');
      });
    }
    if (addScoreTeamB) {
      addScoreTeamB.addEventListener('click', () => {
        if (!this.matchStarted) {
          Utils.showNotification('Start the match before adding scores.', 'error');
          return;
        }
        this.openPopup('B');
      });
    }

    // Submit button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', this.handleSubmitScore);
    }

    // Popup controls
    const closePopupBtn = document.getElementById('closePopupBtn');
    const popupButton = document.getElementById('popupButton');
    
    if (closePopupBtn) {
      closePopupBtn.addEventListener('click', this.closePopup);
    }
    if (popupButton) {
      popupButton.addEventListener('click', this.handleSaveScore);
    }

    // Delete score button (visible in edit mode only)
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', this.handleDeleteScore);
    }

    // Close popup when clicking overlay
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.addEventListener('click', this.closePopup);
    }

    // Timeout edit popup controls
    const timeoutEditOverlay = document.getElementById('timeoutEditOverlay');
    if (timeoutEditOverlay) {
      timeoutEditOverlay.addEventListener('click', this.closeTimeoutEditPopup);
    }
    const closeTimeoutEditPopupBtn = document.getElementById('closeTimeoutEditPopupBtn');
    if (closeTimeoutEditPopupBtn) {
      closeTimeoutEditPopupBtn.addEventListener('click', this.closeTimeoutEditPopup);
    }
    const saveTimeoutEditBtn = document.getElementById('saveTimeoutEditBtn');
    if (saveTimeoutEditBtn) {
      saveTimeoutEditBtn.addEventListener('click', this.handleTimeoutEditSave);
    }

    const halftimeEditOverlay = document.getElementById('halftimeEditOverlay');
    if (halftimeEditOverlay) {
      halftimeEditOverlay.addEventListener('click', this.closeHalftimeEditPopup);
    }
    const closeHalftimeEditPopupBtn = document.getElementById('closeHalftimeEditPopupBtn');
    if (closeHalftimeEditPopupBtn) {
      closeHalftimeEditPopupBtn.addEventListener('click', this.closeHalftimeEditPopup);
    }
    const deleteHalftimeBtn = document.getElementById('deleteHalftimeBtn');
    if (deleteHalftimeBtn) {
      deleteHalftimeBtn.addEventListener('click', this.handleHalftimeDelete);
    }

    // Setup popup controls
    const openSetupBtn = document.getElementById('openSetupBtn');
    if (openSetupBtn) {
      openSetupBtn.addEventListener('click', this.openSetupPopup);
    }

    const closeSetupBtn = document.getElementById('closeSetupPopupBtn');
    if (closeSetupBtn) {
      closeSetupBtn.addEventListener('click', this.closeSetupPopup);
    }

    const saveSetupBtn = document.getElementById('saveSetupBtn');
    if (saveSetupBtn) {
      saveSetupBtn.addEventListener('click', this.handleSetupSave);
    }

    const setupOverlay = document.getElementById('setupOverlay');
    if (setupOverlay) {
      setupOverlay.addEventListener('click', this.closeSetupPopup);
    }

    // Time additions popup controls
    const openTimePopupBtn = document.getElementById('openTimePopupBtn');
    if (openTimePopupBtn) {
      openTimePopupBtn.addEventListener('click', this.openTimePopup);
    }

    const closeTimePopupBtn = document.getElementById('closeTimePopupBtn');
    if (closeTimePopupBtn) {
      closeTimePopupBtn.addEventListener('click', this.closeTimePopup);
    }

    const timeOverlay = document.getElementById('timeOverlay');
    if (timeOverlay) {
      timeOverlay.addEventListener('click', this.closeTimePopup);
    }

    const stoppageBtn = document.getElementById('stoppageToggleBtn');
    if (stoppageBtn) {
      stoppageBtn.addEventListener('click', this.handleStoppageToggle);
    }
  }

  setupTimerButton(button, toggleCallback, resetCallback) {
    if (!button || typeof toggleCallback !== 'function' || typeof resetCallback !== 'function') {
      return;
    }

    const LONG_PRESS_DURATION_MS = 5000;
    let holdTimeout = null;
    let longPressTriggered = false;
    let suppressClick = false;

    const clearHold = () => {
      if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
      }
    };

    const startPress = (event) => {
      if (event?.type === 'mousedown' && event.button !== 0) {
        return;
      }
      if (event?.type === 'touchstart') {
        event.preventDefault();
      }
      longPressTriggered = false;
      clearHold();
      holdTimeout = setTimeout(() => {
        longPressTriggered = true;
        resetCallback();
      }, LONG_PRESS_DURATION_MS);
    };

    const endPress = (event) => {
      if (event) event.preventDefault();
      if (!holdTimeout && !longPressTriggered) {
        return;
      }
      clearHold();
      const wasLongPress = longPressTriggered;
      longPressTriggered = false;
      suppressClick = true;
      if (!wasLongPress) {
        toggleCallback();
      }
    };

    const cancelPress = () => {
      clearHold();
      longPressTriggered = false;
      suppressClick = true;
    };

    button.addEventListener('mousedown', startPress);
    button.addEventListener('touchstart', startPress);
    button.addEventListener('mouseup', endPress);
    button.addEventListener('touchend', endPress);
    button.addEventListener('mouseleave', cancelPress);
    button.addEventListener('touchcancel', cancelPress);
    button.addEventListener('click', (event) => {
      if (suppressClick) {
        suppressClick = false;
        if (event) event.preventDefault();
        return;
      }
      toggleCallback();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  updateMatchControls() {
    const startBtn = document.getElementById('startMatchBtn');
    const addButtons = document.querySelectorAll('.add-score-button .add-score');
    const timeOptionsBtn = document.getElementById('openTimePopupBtn');
    if (this.matchStarted) {
      if (startBtn) startBtn.classList.add('hidden');
      addButtons.forEach((btn) => btn.classList.remove('hidden'));
    } else {
      if (startBtn) startBtn.classList.remove('hidden');
      addButtons.forEach((btn) => btn.classList.add('hidden'));
    }
    this.updateAddScoreButtonsState(addButtons);
    if (timeOptionsBtn) {
      if (this.matchStarted) {
        timeOptionsBtn.disabled = false;
        timeOptionsBtn.classList.remove('disabled');
        timeOptionsBtn.removeAttribute('title');
      } else {
        timeOptionsBtn.disabled = true;
        timeOptionsBtn.classList.add('disabled');
        timeOptionsBtn.title = 'Start the match to access time options.';
      }
    }
  }

  startMatch() {
    if (this.matchStarted) {
      return;
    }
    const teamAValue = (document.getElementById('teamA')?.value || '').trim();
    const teamBValue = (document.getElementById('teamB')?.value || '').trim();

    if (!teamAValue || !teamBValue) {
      Utils.showNotification('Select both Team A and Team B before starting the match.', 'error');
      return;
    }
    if (this.gameStoppageActive) {
      Utils.showNotification('Resolve game stoppage before starting the match.', 'warning');
      return;
    }
    const countdownInput = document.getElementById('countdownTime');
    const configuredMinutes = parseInt(countdownInput?.value, 10);
    const startMinutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : this.gameSettings.matchDuration;

    this.timerManager.defaultMinutes = startMinutes;
    this.timerManager.reset(startMinutes);

    this.halftimeTriggered = false;
    this.currentHalftimeEditID = null;
    this.halftimePendingReason = null;
    this.halftimeAutoSuppressed = false;
    this.halftimeReasonResolved = null;
    this.hardCapReached = false;
    this.matchStarted = true;
    this.timerManager.start();
    this.updateMatchControls();
    this.recordSpecialEvent('matchstart');
    Utils.showNotification('Match started. Score buttons unlocked.', 'info');
    this.autoSave();
  }

  handleHalftime(arg = null) {
    let options = {};
    if (arg && typeof arg === 'object') {
      if (typeof arg.preventDefault === 'function') {
        arg.preventDefault();
      } else {
        options = arg;
      }
    }
    const { silent = false, reason = 'manual' } = options;

    if (this.halftimeTriggered) {
      if (!silent) {
        Utils.showNotification('Halftime has already been recorded.', 'warning');
      }
      return false;
    }

    if (!this.matchStarted) {
      if (!silent) {
        Utils.showNotification('Start the match before recording halftime.', 'error');
      }
      return false;
    }

    if (this.usesPerHalfTimeouts()) {
      const defaultHalf = Math.min(this.gameSettings.timeoutsPerHalf, this.gameSettings.timeoutsTotal);
      ['A', 'B'].forEach((teamKey) => {
        if (this.timeoutState?.[teamKey]) {
          const totalRemaining = this.timeoutState[teamKey].totalRemaining;
          this.timeoutState[teamKey].halfRemaining = Math.min(defaultHalf, totalRemaining);
        }
      });
    } else {
      ['A', 'B'].forEach((teamKey) => {
        if (this.timeoutState?.[teamKey]) {
          this.timeoutState[teamKey].halfRemaining = this.timeoutState[teamKey].totalRemaining;
        }
      });
    }
    this.updateTimeoutUI();

    const halftimeBreakMinutes = this.gameSettings.halftimeBreakDuration || 7;
    const halftimeBreakSeconds = Math.max(1, halftimeBreakMinutes * 60);
    if (this.secondsTimer && typeof this.secondsTimer.reset === 'function') {
      this.secondsTimer.reset(halftimeBreakSeconds);
      this.secondsTimer.start();
    }

    const triggerReason = (reason && typeof reason === 'string') ? reason : 'manual';
    this.halftimeReasonResolved = triggerReason;

    const halftimeLog = this.recordSpecialEvent('halftime', null, { HalftimeReason: triggerReason });
    this.halftimeTriggered = true;
    if (halftimeLog && halftimeLog.scoreID) {
      this.currentHalftimeEditID = halftimeLog.scoreID;
    }
    this.updateHalftimeTracking();
    this.halftimePendingReason = null;
    this.halftimeAutoSuppressed = false;

    if (!silent) {
      Utils.showNotification('Halftime recorded.', 'info');
    }
    this.autoSave();
    return true;
  }

  updateHalftimeTracking() {
    const halftimeLogs = Array.isArray(this.dataManager.scoreLogs)
      ? this.dataManager.scoreLogs.filter(log => (log?.Type || '') === 'halftime')
      : [];
    const latest = halftimeLogs.length > 0 ? halftimeLogs[halftimeLogs.length - 1] : null;
    this.halftimeTriggered = Boolean(latest);
    this.currentHalftimeEditID = latest ? latest.scoreID : null;
    if (this.halftimeTriggered) {
      this.halftimePendingReason = null;
    }
    if (!latest) {
      this.halftimeReasonResolved = null;
    } else if (!this.halftimeReasonResolved) {
      this.halftimeReasonResolved = latest.HalftimeReason || 'restored';
    }
  }

  maybeTriggerHalftimeByScore() {
    if (!this.matchStarted || this.halftimeTriggered) {
      return;
    }
    if (this.halftimeReasonResolved) {
      return;
    }
    if (this.halftimeReasonResolved && this.halftimeReasonResolved !== 'score') {
      return;
    }

    const leadingScore = Math.max(this.teamAScore || 0, this.teamBScore || 0);
    if (this.halftimeAutoSuppressed) {
      if (leadingScore < CONFIG.HALFTIME_SCORE_TARGET) {
        this.halftimeAutoSuppressed = false;
      } else {
        return;
      }
    }

    if (leadingScore >= CONFIG.HALFTIME_SCORE_TARGET) {
      const triggered = this.handleHalftime({ silent: true, reason: 'score' });
      if (triggered) {
        Utils.showNotification(`Halftime reached once a team scored ${CONFIG.HALFTIME_SCORE_TARGET} points.`, 'info');
      }
    }
  }

  updateAddScoreButtonsState(buttons = null) {
    const addButtons = buttons || document.querySelectorAll('.add-score-button .add-score');
    const disable = Boolean(this.hardCapReached);
    addButtons.forEach((btn) => {
      if (!btn) return;
      btn.disabled = disable;
      if (disable) {
        btn.title = 'Score cap reached.';
      } else {
        btn.removeAttribute('title');
      }
    });
  }

  maybeTriggerHalftimeByTime(timeRemaining = null) {
    if (!this.matchStarted || this.halftimeTriggered) {
      return;
    }
    const thresholdMinutes = Math.max(0, this.gameSettings.matchDuration - this.gameSettings.halftimeDuration);
    if (thresholdMinutes <= 0) {
      return;
    }
    const thresholdMs = thresholdMinutes * 60 * 1000;
    let remainingMs = null;
    if (timeRemaining && typeof timeRemaining.total === 'number') {
      remainingMs = Math.max(0, timeRemaining.total);
    } else if (this.timerManager && typeof this.timerManager.getRemainingSeconds === 'function') {
      remainingMs = Math.max(0, this.timerManager.getRemainingSeconds() * 1000);
    }
    if (remainingMs === null) {
      return;
    }
    if (this.halftimeAutoSuppressed) {
      if (remainingMs > thresholdMs) {
        this.halftimeAutoSuppressed = false;
      } else {
        return;
      }
    }
    if (remainingMs <= thresholdMs) {
      if (this.halftimePendingReason !== 'clock') {
        this.halftimePendingReason = 'clock';
        Utils.showNotification('Halftime reached on the game clock. The break will start after the next point.', 'info');
      }
    }
  }

  attemptPendingHalftime() {
    if (!this.matchStarted || this.halftimeTriggered) return;
    if (this.halftimeReasonResolved) return;
    if (this.halftimePendingReason !== 'clock') return;

    const reason = this.halftimePendingReason;
    const triggered = this.handleHalftime({ silent: true, reason });
    if (!triggered) {
      this.halftimePendingReason = reason;
      return;
    }
    Utils.showNotification('Halftime break started after the latest point.', 'info');
  }

  handleMainTimerTick(timeRemaining) {
    this.maybeTriggerHalftimeByTime(timeRemaining);
  }

  getEventTypeLabel(type) {
    switch (type) {
      case 'matchstart':
        return 'Start';
      case 'timeout':
        return 'TimeOut';
      case 'stoppage':
        return 'Stoppage';
      case 'halftime':
        return 'HalfTime';
      default:
        return 'Score';
    }
  }

  recordSpecialEvent(type, teamLetter = null, extra = {}) {
    let displayLabel;
    switch (type) {
      case 'timeout':
        displayLabel = 'Time out';
        break;
      case 'halftime':
        displayLabel = 'HT';
        break;
      case 'matchstart':
        displayLabel = 'MatchStart';
        break;
      case 'stoppage':
        displayLabel = 'STOP';
        break;
      default:
        displayLabel = (type || '').toString().toUpperCase();
        break;
    }

    const scoreID = Date.now().toString();
    const overrides = {
      Type: type,
      Event: displayLabel,
      Score: '',
      Assist: '',
      EventType: this.getEventTypeLabel(type),
      ...extra
    };
    if (!teamLetter) {
      overrides.Team = '';
      overrides.TeamName = '';
      overrides.TeamLetter = '';
    }
    const logEntry = this.createLogObject(scoreID, teamLetter, '', '', overrides);

    this.dataManager.addScoreLog(logEntry);
    if (type !== 'matchstart') {
      this.addScoreToTable(logEntry);
      this.updateAbbaColumn();
      this.adjustScoringTableSizing();
    }
    this.autoSave();
    return logEntry;
  }

  checkForScoreCap(options = {}) {
    const { silent = false } = options;
    const CAP = 15;
    const reached = (this.teamAScore >= CAP) || (this.teamBScore >= CAP);
    const wasHardCap = this.hardCapReached;
    if (reached && !this.hardCapReached) {
      this.hardCapReached = true;
      if (this.timerManager) this.timerManager.stop();
      if (this.secondsTimer) this.secondsTimer.stop();
      if (!silent) {
        Utils.showNotification('Score cap reached. Timers paused.', 'info');
      }
    } else if (!reached && this.hardCapReached) {
      this.hardCapReached = false;
    }
    if (wasHardCap !== this.hardCapReached || !wasHardCap) {
      this.updateAddScoreButtonsState();
    }
  }

  handleStoppageToggle() {
    this.gameStoppageActive = !this.gameStoppageActive;
    if (this.gameStoppageActive) {
      this.pauseAllTimers();
      this.recordSpecialEvent('stoppage');
      Utils.showNotification('Game stoppage recorded. Timers paused.', 'warning');
    } else {
      Utils.showNotification('Game stoppage cleared.', 'info');
      const shouldRestartMain = this.matchStarted && !this.hardCapReached;
      if (shouldRestartMain && this.timerManager && !this.timerManager.isRunning) {
        this.timerManager.start();
      }
      if (this.secondsTimer && !this.secondsTimer.isRunning && this.stoppagePausedSecondsTimer) {
        this.secondsTimer.start();
      }
      this.stoppagePausedMainTimer = false;
      this.stoppagePausedSecondsTimer = false;
    }
    this.updateStoppageUI();
    this.autoSave();
  }

  pauseAllTimers() {
    this.stoppagePausedMainTimer = Boolean(this.timerManager && this.timerManager.isRunning);
    this.stoppagePausedSecondsTimer = Boolean(this.secondsTimer && this.secondsTimer.isRunning);

    if (this.timerManager && typeof this.timerManager.stop === 'function' && this.timerManager.isRunning) {
      this.timerManager.stop();
    }
    if (this.secondsTimer && typeof this.secondsTimer.stop === 'function' && this.secondsTimer.isRunning) {
      this.secondsTimer.stop();
    }
  }

  openTimeoutEditPopup(scoreID) {
    const logEntry = this.dataManager.getScoreLog(scoreID);
    if (!logEntry || (logEntry.Type || '') !== 'timeout') {
      Utils.showNotification('Selected entry is not a timeout.', 'error');
      return;
    }

    const overlay = document.getElementById('timeoutEditOverlay');
    const popup = document.getElementById('timeoutEditPopup');
    const teamSelect = document.getElementById('timeoutEditTeam');

    if (!overlay || !popup || !teamSelect) {
      Utils.showNotification('Timeout editor is unavailable.', 'error');
      return;
    }

    const teamAName = (document.getElementById('teamA')?.value || '').trim();
    const teamBName = (document.getElementById('teamB')?.value || '').trim();
    const optionA = teamSelect.querySelector('option[value="A"]');
    const optionB = teamSelect.querySelector('option[value="B"]');
    if (optionA) optionA.textContent = teamAName || 'Team A';
    if (optionB) optionB.textContent = teamBName || 'Team B';

    teamSelect.value = logEntry.TeamLetter || '';
    this.currentTimeoutEditID = scoreID;

    overlay.style.display = 'block';
    popup.style.display = 'block';
  }

  closeTimeoutEditPopup() {
    const overlay = document.getElementById('timeoutEditOverlay');
    const popup = document.getElementById('timeoutEditPopup');
    const teamSelect = document.getElementById('timeoutEditTeam');

    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
    if (teamSelect) teamSelect.value = '';

    this.currentTimeoutEditID = null;
  }

  handleTimeoutEditSave() {
    if (!this.currentTimeoutEditID) {
      Utils.showNotification('No timeout selected to update.', 'error');
      return;
    }

    const existingLog = this.dataManager.getScoreLog(this.currentTimeoutEditID);
    if (!existingLog || (existingLog.Type || '') !== 'timeout') {
      Utils.showNotification('Selected entry is not a timeout.', 'error');
      return;
    }

    const teamSelect = document.getElementById('timeoutEditTeam');
    const teamLetter = teamSelect?.value || '';
    if (!teamLetter) {
      Utils.showNotification('Select the team that called the timeout.', 'error');
      return;
    }

    const teamAName = (document.getElementById('teamA')?.value || '').trim();
    const teamBName = (document.getElementById('teamB')?.value || '').trim();
    const teamName = teamLetter === 'A' ? teamAName : teamBName;

    if (!teamName) {
      Utils.showNotification('Assign Team A and Team B before editing the timeout.', 'error');
      return;
    }

    const oldTeamLetter = existingLog.TeamLetter || '';

    const updated = this.dataManager.updateScoreLog(this.currentTimeoutEditID, {
      TeamLetter: teamLetter,
      Team: teamName,
      TeamName: teamName
    });

    if (!updated) {
      Utils.showNotification('Failed to update timeout entry.', 'error');
      return;
    }

    if (oldTeamLetter !== teamLetter) {
      this.adjustTimeoutCountsForEdit(oldTeamLetter, teamLetter);
    }

    this.closeTimeoutEditPopup();
    this.rebuildTableAndCounters();
    this.autoSave();
    Utils.showNotification('Timeout updated.', 'success');
  }

  openHalftimeEditPopup(scoreID) {
    const logEntry = this.dataManager.getScoreLog(scoreID);
    if (!logEntry || (logEntry.Type || '') !== 'halftime') {
      Utils.showNotification('Selected entry is not a halftime log.', 'error');
      return;
    }

    const overlay = document.getElementById('halftimeEditOverlay');
    const popup = document.getElementById('halftimeEditPopup');

    if (!overlay || !popup) {
      Utils.showNotification('Halftime editor is unavailable.', 'error');
      return;
    }

    this.currentHalftimeEditID = scoreID;
    overlay.style.display = 'block';
    popup.style.display = 'block';
  }

  closeHalftimeEditPopup() {
    const overlay = document.getElementById('halftimeEditOverlay');
    const popup = document.getElementById('halftimeEditPopup');

    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';

    this.currentHalftimeEditID = null;
  }

  handleHalftimeDelete() {
    if (!this.currentHalftimeEditID) {
      Utils.showNotification('No halftime entry selected to delete.', 'error');
      return;
    }

    const scoreID = this.currentHalftimeEditID;
    const removed = this.dataManager.removeScoreLog(scoreID);
    if (!removed) {
      Utils.showNotification('Failed to delete halftime entry.', 'error');
      return;
    }

    this.halftimeAutoSuppressed = true;
    this.halftimePendingReason = null;
    this.halftimeTriggered = false;
    this.halftimeReasonResolved = null;
    this.closeHalftimeEditPopup();

    const row = document.querySelector(`tr[data-score-id="${scoreID}"]`);
    if (row && row.parentElement) {
      row.parentElement.removeChild(row);
    }

    if (this.secondsTimer && typeof this.secondsTimer.reset === 'function') {
      this.secondsTimer.reset(this.gameSettings.timeoutDuration || this.secondsTimer.defaultSeconds);
    }

    this.rebuildTableAndCounters();
    this.autoSave();
    Utils.showNotification('Halftime entry deleted.', 'success');
  }
  updateStoppageUI() {
    const stoppageBtn = document.getElementById('stoppageToggleBtn');
    if (stoppageBtn) {
      stoppageBtn.classList.toggle('active', this.gameStoppageActive);
      stoppageBtn.textContent = this.gameStoppageActive ? 'GAME STOPPAGE ACTIVE' : 'GAME STOPPAGE';
      stoppageBtn.setAttribute('aria-pressed', this.gameStoppageActive ? 'true' : 'false');
    }
    const closeBtn = document.getElementById('closeTimePopupBtn');
    if (closeBtn) {
      closeBtn.disabled = this.gameStoppageActive;
      closeBtn.style.opacity = this.gameStoppageActive ? '0.4' : '';
      closeBtn.style.cursor = this.gameStoppageActive ? 'not-allowed' : 'pointer';
    }
    ['timeoutTeamA', 'timeoutTeamB'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.disabled = this.gameStoppageActive;
      }
    });
  }

  getLogType(logEntry) {
    if (!logEntry) return '';
    const rawType = logEntry.Type;
    if (typeof rawType === 'string' && rawType.trim().length > 0) {
      return rawType.trim().toLowerCase();
    }
    return 'score';
  }

  isScoreLog(logEntry) {
    return this.getLogType(logEntry) === 'score';
  }

  getTeamLetterFromLog(logEntry) {
    if (!logEntry) return '';
    if (logEntry.TeamLetter) return logEntry.TeamLetter;

    const candidate = logEntry.TeamName || logEntry.Team || '';
    const teamAName = document.getElementById('teamA')?.value || '';
    const teamBName = document.getElementById('teamB')?.value || '';

    if (candidate === teamAName) return 'A';
    if (candidate === teamBName) return 'B';
    return '';
  }

  getAbbaIndexForLog(logEntry) {
    if (!this.isScoreLog(logEntry)) {
      return null;
    }

    let index = 0;
    for (const entry of this.dataManager.scoreLogs) {
      if (this.isScoreLog(entry)) {
        if (entry.scoreID === logEntry.scoreID) {
          return index;
        }
        index++;
      }
    }
    return null;
  }

  /**
   * ABBA selector changed
   */
  handleAbbaChange(newValue = null, shouldAutoSave = true) {
    const selected = typeof newValue === 'string' ? newValue : this.abbaStart || 'M';
    this.abbaStart = selected === 'F' || selected === 'NONE' ? selected : 'M';
    this.setAbbaVisibility(this.abbaStart !== 'NONE');
    this.updateAbbaDisplay();
    if (this.abbaStart !== 'NONE') {
      this.updateAbbaColumn();
    } else {
      this.clearAbbaCells();
    }
    const setupAbba = document.getElementById('setupAbba');
    if (setupAbba && typeof newValue === 'string') {
      setupAbba.value = this.abbaStart;
    }
    this.adjustScoringTableSizing();
    if (shouldAutoSave) {
      this.autoSave();
    }
  }

  /**
   * Recompute ABBA column values for all rows
   */
  updateAbbaColumn() {
    if (this.abbaStart === 'NONE') {
      this.clearAbbaCells();
      return;
    }
    this.setAbbaVisibility(true);
    const tbody = document.getElementById('scoringTableBody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let scoringIndex = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const abbaCell = row.cells?.[0];
      if (!abbaCell) return;
      const scoreId = row.getAttribute('data-score-id');
      const logEntry = this.dataManager.getScoreLog(scoreId);
      if (this.isScoreLog(logEntry)) {
        abbaCell.textContent = this.computeAbbaForIndex(scoringIndex);
        scoringIndex++;
      } else {
        abbaCell.textContent = '';
      }
    }
  }

  /**
   * Hide or show the ABBA column based on setting
   */
  setAbbaVisibility(shouldShow) {
    const scoringTable = document.getElementById('scoringTable');
    if (!scoringTable) return;
    if (shouldShow) {
      scoringTable.classList.remove('abba-hidden');
    } else {
      scoringTable.classList.add('abba-hidden');
    }
  }

  /**
   * Ensure scoring table text fits within fixed columns
   */
  adjustScoringTableSizing() {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.tableResizeFrame) {
      cancelAnimationFrame(this.tableResizeFrame);
      this.tableResizeFrame = null;
    }

    this.tableResizeFrame = window.requestAnimationFrame(() => {
      const table = document.getElementById('scoringTable');
      if (!table) {
        this.tableResizeFrame = null;
        return;
      }

      const adjustableCells = table.querySelectorAll('th, td');
      adjustableCells.forEach((cell) => {
        if (!cell) {
          return;
        }

        if (cell.offsetParent === null) {
          cell.classList.remove('scoring-cell-truncated');
          return;
        }

        if (cell.classList.contains('event-cell')) {
          cell.classList.remove('scoring-cell-truncated');
          cell.style.fontSize = '';
          return;
        }

        cell.classList.remove('scoring-cell-truncated');
        cell.style.fontSize = '';

        const computedSize = parseFloat(window.getComputedStyle(cell).fontSize) || 12;
        let currentSize = computedSize;
        const minSize = Math.max(10, computedSize * 0.65);
        const interactive = cell.querySelector('.edit-btn');
        if (interactive) {
          interactive.style.fontSize = '';
        }

        cell.style.fontSize = `${currentSize}px`;

        if (!cell.clientWidth) {
          return;
        }

        while (cell.scrollWidth > cell.clientWidth && currentSize > minSize) {
          currentSize = Math.max(minSize, currentSize - 0.5);
          cell.style.fontSize = `${currentSize}px`;
        }

        if (interactive) {
          interactive.style.fontSize = `${Math.max(10, currentSize - 1)}px`;
        }

        if (cell.scrollWidth > cell.clientWidth + 1) {
          cell.classList.add('scoring-cell-truncated');
        }
      });

      this.tableResizeFrame = null;
    });
  }

  /**
   * Update ABBA header display value
   */
  updateAbbaDisplay() {
    const abbaDisplay = document.getElementById('abbaDisplay');
    if (!abbaDisplay) return;
    if (this.abbaStart === 'NONE') {
      abbaDisplay.textContent = '-';
    } else {
      abbaDisplay.textContent = this.abbaStart || '-';
    }
  }

  /**
   * Clear all ABBA cells when the column is disabled
   */
  clearAbbaCells() {
    const tbody = document.getElementById('scoringTableBody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((row) => {
      const abbaCell = row.cells?.[0];
      if (abbaCell) abbaCell.textContent = '';
    });
  }

  /**
   * Compute ABBA value (M/F) for given point index
   * Pattern: start,start,other,other,repeat
   */
  computeAbbaForIndex(index) {
    if (this.abbaStart === 'NONE') return '';
    const start = this.abbaStart === 'F' ? 'F' : 'M';
    const other = start === 'M' ? 'F' : 'M';
    // First point is a single occurrence of start (index 0)
    if (index === 0) return start;
    // Thereafter alternate in pairs: other, other, start, start, ...
    const adjusted = index - 1;
    const block = Math.floor(adjusted / 2);
    return block % 2 === 0 ? other : start;
  }

  /**
   * Handle team selection change
   */
  handleTeamChange(teamID) {
    const selectedTeam = document.getElementById(teamID)?.value || '';
    const playerListElement = document.getElementById(`${teamID}List`);
    
    if (playerListElement) {
      if (!selectedTeam) {
        playerListElement.value = '';
      } else {
        const teamsData = this.dataManager.getTeamsData();
        const players = teamsData[selectedTeam] || [];
        playerListElement.value = players.join('\n');
      }
      
      // Auto-resize textarea
      playerListElement.style.height = 'auto';
      playerListElement.style.height = playerListElement.scrollHeight + 'px';
    }

    this.updateTeamsDisplay();
  }

  /**
   * Update the on-page team matchup display
   */
  updateTeamsDisplay() {
    const display = document.getElementById('teamsDisplay');
    const teamAName = (document.getElementById('teamA')?.value || '').trim();
    const teamBName = (document.getElementById('teamB')?.value || '').trim();

    if (display) {
      const left = teamAName || 'A';
      const right = teamBName || 'B';
      display.textContent = `${left} vs ${right}`;
    }

    const labelA = document.getElementById('timeoutTeamLabelA');
    if (labelA) {
      labelA.textContent = teamAName || 'Team A';
    }
    const labelB = document.getElementById('timeoutTeamLabelB');
    if (labelB) {
      labelB.textContent = teamBName || 'Team B';
    }
  }

  usesPerHalfTimeouts() {
    return Number.isFinite(this.gameSettings.timeoutsPerHalf) && this.gameSettings.timeoutsPerHalf > 0;
  }

  /**
   * Initialize or restore timeout counts
   */
  initializeTimeoutState(savedState = null) {
    const defaultTotal = Math.max(0, this.gameSettings.timeoutsTotal);
    const perHalfEnabled = this.usesPerHalfTimeouts();
    const defaultHalf = perHalfEnabled
      ? Math.min(this.gameSettings.timeoutsPerHalf, defaultTotal)
      : defaultTotal;

    const clampCount = (value, fallback, max) => {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        return fallback;
      }
      const upperBound = typeof max === 'number' ? Math.max(0, max) : fallback;
      return Math.min(value, upperBound);
    };

    const createState = (teamKey) => {
      const source = savedState?.[teamKey];
      const totalRemaining = clampCount(source?.totalRemaining, defaultTotal, defaultTotal);
      const halfRemaining = perHalfEnabled
        ? clampCount(source?.halfRemaining, defaultHalf, defaultHalf)
        : totalRemaining;
      return {
        totalRemaining,
        halfRemaining
      };
    };

    this.timeoutState = {
      A: createState('A'),
      B: createState('B')
    };

    this.updateTimeoutUI();
  }

  /**
   * Snapshot helper to avoid direct references when saving
   */
  getTimeoutStateSnapshot() {
    const perHalfEnabled = this.usesPerHalfTimeouts();
    const makeCopy = (teamKey) => {
      const source = this.timeoutState?.[teamKey] || {};
      const total = source.totalRemaining ?? this.gameSettings.timeoutsTotal;
      const half = perHalfEnabled
        ? (source.halfRemaining ?? this.gameSettings.timeoutsPerHalf)
        : total;
      return {
        totalRemaining: total,
        halfRemaining: half
      };
    };

    return {
      A: makeCopy('A'),
      B: makeCopy('B')
    };
  }

  /**
   * Update timeout counters in the UI
   */
  updateTimeoutUI() {
    const state = this.getTimeoutStateSnapshot();
    const perHalfEnabled = this.usesPerHalfTimeouts();
    const formatHalf = (teamState) => (perHalfEnabled ? teamState.halfRemaining : 'N/A');
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('timeoutARemainingTotal', state.A.totalRemaining);
    setText('timeoutARemainingHalf', formatHalf(state.A));
    setText('timeoutBRemainingTotal', state.B.totalRemaining);
    setText('timeoutBRemainingHalf', formatHalf(state.B));
  }

  /**
   * Handle timeout usage for a team
   */
  handleTimeout(team) {
    if (!this.matchStarted) {
      Utils.showNotification('Start the match before logging a timeout.', 'error');
      return;
    }
    if (this.gameStoppageActive) {
      Utils.showNotification('Resolve game stoppage before recording a timeout.', 'warning');
      return;
    }
    if (!this.timeoutState?.[team]) return;

    const teamNameInputId = team === 'A' ? 'teamA' : 'teamB';
    const teamDisplayName = (document.getElementById(teamNameInputId)?.value || '').trim() || (team === 'A' ? 'Team A' : 'Team B');
    const perHalfEnabled = this.usesPerHalfTimeouts();
    const teamName = teamDisplayName;
    const state = this.timeoutState[team];

    if (state.totalRemaining <= 0) {
      Utils.showNotification(`${teamName} has no timeouts remaining.`, 'error');
      return;
    }

    if (perHalfEnabled && state.halfRemaining <= 0) {
      Utils.showNotification(`${teamName} has no timeouts remaining for this half.`, 'error');
      return;
    }

    state.totalRemaining = Math.max(0, state.totalRemaining - 1);
    if (perHalfEnabled) {
      state.halfRemaining = Math.max(0, state.halfRemaining - 1);
    } else {
      state.halfRemaining = state.totalRemaining;
    }

    this.updateTimeoutUI();
    if (this.secondsTimer && typeof this.secondsTimer.reset === 'function') {
      const defaultSeconds = this.gameSettings.timeoutDuration || this.secondsTimer.defaultSeconds;
      this.secondsTimer.reset(defaultSeconds);
      if (typeof this.secondsTimer.start === 'function') {
        this.secondsTimer.start();
      }
    }
    this.recordSpecialEvent('timeout', team);
    Utils.showNotification(`Timeout recorded for ${teamName}.`, 'info');
  }

  adjustTimeoutCountsForEdit(oldTeam, newTeam) {
    const normalize = (value, max) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return 0;
      const bounded = Math.max(0, value);
      if (!Number.isFinite(max) || max <= 0) {
        return bounded;
      }
      return Math.min(bounded, max);
    };
    const perHalfEnabled = this.usesPerHalfTimeouts();

    if (oldTeam && this.timeoutState?.[oldTeam]) {
      const state = this.timeoutState[oldTeam];
      state.totalRemaining = normalize(state.totalRemaining + 1, this.gameSettings.timeoutsTotal);
      state.halfRemaining = perHalfEnabled
        ? normalize(state.halfRemaining + 1, this.gameSettings.timeoutsPerHalf)
        : state.totalRemaining;
    }

    if (newTeam && this.timeoutState?.[newTeam]) {
      const state = this.timeoutState[newTeam];
      state.totalRemaining = normalize(state.totalRemaining - 1, this.gameSettings.timeoutsTotal);
      state.halfRemaining = perHalfEnabled
        ? normalize(state.halfRemaining - 1, this.gameSettings.timeoutsPerHalf)
        : state.totalRemaining;
    }

    this.updateTimeoutUI();
  }

  /**
   * Open score popup
   */
  openPopup(team) {
    if (!this.matchStarted) {
      Utils.showNotification('Start the match before adding scores.', 'error');
      return;
    }
    if (this.hardCapReached) {
      Utils.showNotification('Score cap reached. No further scores can be added.', 'warning');
      return;
    }
    this.currentEditID = null;

    const overlay = document.getElementById('overlay');
    const popup = document.getElementById('scorePopup');
    const popupTitle = document.getElementById('popupTitle');
    const popupButton = document.getElementById('popupButton');
    
    if (!overlay || !popup) return;

    // Show popup
    overlay.style.display = 'block';
    popup.style.display = 'block';
    popup.dataset.team = team;

    // Set popup content
    if (popupTitle) popupTitle.textContent = 'Add Score';
    if (popupButton) popupButton.value = 'Add Score';

    // Hide delete when adding new
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    this.populatePlayerDropdowns(team);
  }

  /**
   * Populate player dropdowns in score popup
   */
  populatePlayerDropdowns(team) {
    const scorerDropdown = document.getElementById('scorer');
    const assistDropdown = document.getElementById('assist');
    
    if (!scorerDropdown || !assistDropdown) return;

    // Clear existing options
    scorerDropdown.innerHTML = '<option value="">Select Scorer</option>';
    assistDropdown.innerHTML = '<option value="">Select Assist</option>';

    // Get players for the selected team
    const playersText = document.getElementById(
      team === 'A' ? 'teamAList' : 'teamBList'
    )?.value || '';
    
    const players = playersText ? playersText.split('\n').filter(p => p.trim()) : [];

    // Add player options
    players.forEach(player => {
      const trimmedPlayer = player.trim();
      if (trimmedPlayer) {
        scorerDropdown.appendChild(Utils.createElement('option', { value: trimmedPlayer }, trimmedPlayer));
        assistDropdown.appendChild(Utils.createElement('option', { value: trimmedPlayer }, trimmedPlayer));
      }
    });

    // Add special options
    scorerDropdown.appendChild(Utils.createElement('option', { value: SPECIAL_OPTIONS.NA }, SPECIAL_OPTIONS.NA));
    assistDropdown.appendChild(Utils.createElement('option', { value: SPECIAL_OPTIONS.NA }, SPECIAL_OPTIONS.NA));
    assistDropdown.appendChild(Utils.createElement('option', { value: SPECIAL_OPTIONS.CALLAHAN }, SPECIAL_OPTIONS.CALLAHAN));
  }

  /**
   * Handle save score
   */
  handleSaveScore() {
    const popup = document.getElementById('scorePopup');
    const team = popup?.dataset.team;
    const scorer = document.getElementById('scorer')?.value;
    const assist = document.getElementById('assist')?.value;

    if (!team || !scorer || !assist) {
      Utils.showNotification('Please select both scorer and assist.', 'error');
      return;
    }

    if (!this.currentEditID) {
      this.addNewScore(team, scorer, assist);
    } else {
      this.updateExistingScore(scorer, assist);
    }
  }

  /**
   * Add new score
   */
  addNewScore(team, scorer, assist) {
    // Update score
    if (team === 'A') {
      this.teamAScore++;
    } else {
      this.teamBScore++;
    }

    // Create log entry
    const newScoreID = Date.now().toString();
    const logEntry = this.createLogObject(newScoreID, team, scorer, assist);

    // Save to data manager
    this.dataManager.addScoreLog(logEntry);
    this.checkForScoreCap();

    // Add to table
    this.addScoreToTable(logEntry);
    this.updateAbbaColumn();
    this.adjustScoringTableSizing();
    this.maybeTriggerHalftimeByScore();
    this.attemptPendingHalftime();
    
    this.closePopup();
  }

  /**
   * Update existing score
   */
  updateExistingScore(scorer, assist) {
    const updated = this.dataManager.updateScoreLog(this.currentEditID, {
      Score: scorer,
      Assist: assist
    });

    if (updated) {
      this.updateScoreInTable(this.currentEditID, scorer, assist);
      this.closePopup();
    } else {
      Utils.showNotification('Could not find score to update.', 'error');
    }
  }

  /**
   * Create log object
   */
  createLogObject(scoreID, teamLetter, scorer, assist, overrides = {}) {
    const teamAName = document.getElementById('teamA')?.value || '';
    const teamBName = document.getElementById('teamB')?.value || '';
    const gameID = `${teamAName} vs ${teamBName}`;
    let teamName = '';
    if (teamLetter === 'A') {
      teamName = teamAName;
    } else if (teamLetter === 'B') {
      teamName = teamBName;
    }

    const baseLog = {
      scoreID,
      GameID: gameID,
      Time: new Date().toLocaleString(),
      Team: teamName,
      TeamName: teamName,
      TeamLetter: teamLetter || '',
      Score: scorer,
      Assist: assist,
      Type: 'score',
      Event: '',
      EventType: this.getEventTypeLabel('score')
    };

    const mergedLog = { ...baseLog, ...overrides };

    mergedLog.EventType = overrides.EventType ?? this.getEventTypeLabel(mergedLog.Type);

    return mergedLog;
  }

  /**
   * Add score row to table
   */
  addScoreToTable(logEntry) {
    const scoringTableBody = document.getElementById('scoringTableBody');
    if (!scoringTableBody) return;

    const abbaIndex = this.getAbbaIndexForLog(logEntry);
    const row = this.createScoreRow(logEntry, abbaIndex);
    if (!row) return;
    if (scoringTableBody.firstChild) {
      scoringTableBody.insertBefore(row, scoringTableBody.firstChild);
    } else {
      scoringTableBody.appendChild(row);
    }
  }

  /**
   * Create score table row
   */
  createScoreRow(logEntry, abbaIndex = null) {
    const teamLetter = this.getTeamLetterFromLog(logEntry);
    const normalizedTeamLetter = (teamLetter || '').toUpperCase();
    const row = document.createElement('tr');
    const buildEditButton = (extraClass = '') => {
      const classes = ['edit-btn'];
      if (extraClass) classes.push(extraClass);
      return `<button type="button" class="${classes.join(' ')}" aria-label="Edit entry"><span class="icon-gear" aria-hidden="true"></span></button>`;
    };

    row.setAttribute('data-score-id', logEntry.scoreID);

    const scoreboard = `${this.teamAScore}:${this.teamBScore}`;
    const type = this.getLogType(logEntry);
    const isScore = type === 'score';
    const eventLabel = logEntry.Event || '';
    const abba = (isScore && abbaIndex !== null)
      ? this.computeAbbaForIndex(abbaIndex)
      : '';

    if (type === 'timeout') {
      row.classList.add('event-row', 'event-timeout-row');
      const label = eventLabel || 'Time out';
      if (normalizedTeamLetter === 'A') {
        row.innerHTML = `
        <td class="abba-cell">${abba}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td class="total">${scoreboard}</td>
        <td></td>
        <td></td>
        <td>${buildEditButton('timeout-edit-btn')}</td>
      `;
      } else if (normalizedTeamLetter === 'B') {
        row.innerHTML = `
        <td class="abba-cell">${abba}</td>
        <td></td>
        <td></td>
        <td class="total">${scoreboard}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td>${buildEditButton('timeout-edit-btn')}</td>
      `;
      } else {
        row.innerHTML = `
        <td class="abba-cell">${abba}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td class="total">${scoreboard}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td>${buildEditButton('timeout-edit-btn')}</td>
      `;
      }
      const editBtn = row.querySelector('.timeout-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => this.openTimeoutEditPopup(logEntry.scoreID));
      }
      return row;
    }

    if (type === 'halftime') {
      row.classList.add('event-row', 'halftime-row');
      const label = eventLabel || 'HT';
      row.innerHTML = `
        <td class="abba-cell">${abba}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td class="total">${scoreboard}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td>${buildEditButton('halftime-edit-btn')}</td>
      `;
      const editBtn = row.querySelector('.halftime-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => this.openHalftimeEditPopup(logEntry.scoreID));
      }
      return row;
    }

    if (type === 'matchstart') {
      return null;
    }

    if (type === 'stoppage') {
      row.classList.add('event-row', 'stoppage-row');
      const label = eventLabel || 'STOP';
      row.innerHTML = `
        <td class="abba-cell">${abba}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td class="total">${scoreboard}</td>
        <td colspan="2" class="event-cell">${label}</td>
        <td></td>
      `;
      return row;
    }

    if (isScore && teamLetter === 'A') {
      row.innerHTML = `
        <td class=\"abba-cell\">${abba}</td>
        <td class="score-cell">${logEntry.Score}</td>
        <td class="assist-cell">${logEntry.Assist}</td>
        <td class="total">${scoreboard}</td>
        <td></td>
        <td></td>
        <td>${buildEditButton()}</td>
      `;
    } else if (isScore) {
      row.innerHTML = `
        <td class=\"abba-cell\">${abba}</td>
        <td></td>
        <td></td>
        <td class="total">${scoreboard}</td>
        <td class="score-cell">${logEntry.Score}</td>
        <td class="assist-cell">${logEntry.Assist}</td>
        <td>${buildEditButton()}</td>
      `;
    } else {
      return null;
    }

    // Add edit functionality
    const editBtn = row.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.editScore(logEntry.scoreID));
    }

    return row;
  }

  /**
   * Update score in table
   */
  updateScoreInTable(scoreID, scorer, assist) {
    const row = document.querySelector(`tr[data-score-id="${scoreID}"]`);
    const popup = document.getElementById('scorePopup');
    
    if (!row || !popup) return;

    const teamLetter = popup.dataset.team;
    if (teamLetter === 'A') {
      row.cells[1].textContent = scorer;
      row.cells[2].textContent = assist;
    } else {
      row.cells[4].textContent = scorer;
      row.cells[5].textContent = assist;
    }
    this.adjustScoringTableSizing();
  }

  /**
   * Edit existing score
   */
  editScore(scoreID) {
    const logToEdit = this.dataManager.getScoreLog(scoreID);
    if (!logToEdit) {
      Utils.showNotification('Could not find score to edit!', 'error');
      return;
    }

    this.currentEditID = scoreID;

    // Show popup in edit mode
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById('scorePopup');
    const popupTitle = document.getElementById('popupTitle');
    const popupButton = document.getElementById('popupButton');
    
    if (overlay) overlay.style.display = 'block';
    if (popup) popup.style.display = 'block';
    if (popupTitle) popupTitle.textContent = 'Edit Score';
    if (popupButton) popupButton.value = 'Update Score';

    // Show delete in edit mode
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';

    // Determine team
    const teamAName = document.getElementById('teamA')?.value || '';
    const teamLetter = (logToEdit.Team === teamAName) ? 'A' : 'B';
    
    if (popup) popup.dataset.team = teamLetter;

    // Populate dropdowns and set current values
    this.populatePlayerDropdowns(teamLetter);
    
    setTimeout(() => {
      const scorerDropdown = document.getElementById('scorer');
      const assistDropdown = document.getElementById('assist');
      
      if (scorerDropdown) scorerDropdown.value = logToEdit.Score;
      if (assistDropdown) assistDropdown.value = logToEdit.Assist;
    }, 0);
  }

  /**
   * Close popup
   */
  closePopup() {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById('scorePopup');
    
    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';

    this.currentEditID = null;
  }

  /**
   * Show the initial loading popup
   */
  showLoadingPopup() {
    const overlay = document.getElementById('loadingOverlay');
    const popup = document.getElementById('loadingPopup');

    if (overlay) overlay.style.display = 'block';
    if (popup) popup.style.display = 'block';
  }

  /**
   * Hide the initial loading popup
   */
  hideLoadingPopup() {
    const overlay = document.getElementById('loadingOverlay');
    const popup = document.getElementById('loadingPopup');

    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
  }

  /**
   * Close any popups shown during initial load
   */
  finishInitialLoading() {
    this.closePopup();
    this.hideLoadingPopup();
  }

  /**
   * Show setup popup with current settings
   */
  openSetupPopup() {
    this.populateSetupForm();

    const overlay = document.getElementById('setupOverlay');
    const popup = document.getElementById('setupPopup');

    if (overlay) overlay.style.display = 'block';
    if (popup) popup.style.display = 'block';
  }

  /**
   * Close setup popup
   */
  closeSetupPopup() {
    const overlay = document.getElementById('setupOverlay');
    const popup = document.getElementById('setupPopup');

    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
  }

  /**
   * Open time additions popup
   */
  openTimePopup() {
    if (!this.matchStarted) {
      Utils.showNotification('Start the match to access time options.', 'error');
      return;
    }
    const overlay = document.getElementById('timeOverlay');
    const popup = document.getElementById('timePopup');

    if (overlay) overlay.style.display = 'block';
    if (popup) popup.style.display = 'block';
    this.updateStoppageUI();
  }

  /**
   * Close time additions popup
   */
  closeTimePopup(event = null) {
    if (this.gameStoppageActive) {
      if (event) event.preventDefault();
      Utils.showNotification('Disable game stoppage before closing.', 'warning');
      return;
    }
    const overlay = document.getElementById('timeOverlay');
    const popup = document.getElementById('timePopup');

    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
  }

  /**
   * Populate setup form fields with current values
   */
  populateSetupForm() {
    const matchInput = document.getElementById('setupMatchDuration');
    if (matchInput) matchInput.value = this.gameSettings.matchDuration;

    const timeoutInput = document.getElementById('setupTimeoutDuration');
    if (timeoutInput) timeoutInput.value = this.gameSettings.timeoutDuration;

    const timeoutsTotalInput = document.getElementById('setupTimeoutsTotal');
    if (timeoutsTotalInput) timeoutsTotalInput.value = this.gameSettings.timeoutsTotal;

    const timeoutsPerHalfInput = document.getElementById('setupTimeoutsPerHalf');
    if (timeoutsPerHalfInput) timeoutsPerHalfInput.value = this.gameSettings.timeoutsPerHalf;

    const halftimeInput = document.getElementById('setupHalftime');
    if (halftimeInput) halftimeInput.value = this.gameSettings.halftimeDuration;

    const halftimeDurationInput = document.getElementById('setupHalftimeDuration');
    if (halftimeDurationInput) halftimeDurationInput.value = this.gameSettings.halftimeBreakDuration;

    const setupAbba = document.getElementById('setupAbba');
    if (setupAbba) setupAbba.value = this.abbaStart || 'M';
  }

  /**
   * Apply settings entered in the setup popup
   */
  handleSetupSave() {
    const clampNumber = (value, fallback, min, max) => {
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) return fallback;
      const clamped = Math.max(min, Math.min(max, parsed));
      return clamped;
    };

    const newMatchDuration = clampNumber(
      document.getElementById('setupMatchDuration')?.value,
      this.gameSettings.matchDuration,
      1,
      300
    );
    const newHalftimeDuration = clampNumber(
      document.getElementById('setupHalftime')?.value,
      this.gameSettings.halftimeDuration,
      1,
      newMatchDuration
    );
    const newTimeoutDuration = clampNumber(
      document.getElementById('setupTimeoutDuration')?.value,
      this.gameSettings.timeoutDuration,
      1,
      3600
    );
    const newTimeoutsTotal = clampNumber(
      document.getElementById('setupTimeoutsTotal')?.value,
      this.gameSettings.timeoutsTotal,
      0,
      10
    );
    let newTimeoutsPerHalf = clampNumber(
      document.getElementById('setupTimeoutsPerHalf')?.value,
      this.gameSettings.timeoutsPerHalf,
      0,
      10
    );
    newTimeoutsPerHalf = Math.min(newTimeoutsPerHalf, newTimeoutsTotal);

    const newHalftimeBreakDuration = clampNumber(
      document.getElementById('setupHalftimeDuration')?.value,
      this.gameSettings.halftimeBreakDuration,
      1,
      120
    );

    const abbaSelection = document.getElementById('setupAbba')?.value || this.abbaStart || 'M';

    this.gameSettings = {
      matchDuration: newMatchDuration,
      halftimeDuration: newHalftimeDuration,
      halftimeBreakDuration: newHalftimeBreakDuration,
      timeoutDuration: newTimeoutDuration,
      timeoutsTotal: newTimeoutsTotal,
      timeoutsPerHalf: newTimeoutsPerHalf
    };

    this.initializeTimeoutState();
    this.applyGameSettingsToUI();

    this.handleAbbaChange(abbaSelection, false);

    const matchInput = document.getElementById('setupMatchDuration');
    if (matchInput) matchInput.value = this.gameSettings.matchDuration;
    const timeoutInput = document.getElementById('setupTimeoutDuration');
    if (timeoutInput) timeoutInput.value = this.gameSettings.timeoutDuration;
    const totalInput = document.getElementById('setupTimeoutsTotal');
    if (totalInput) totalInput.value = this.gameSettings.timeoutsTotal;
    const perHalfInput = document.getElementById('setupTimeoutsPerHalf');
    if (perHalfInput) perHalfInput.value = this.gameSettings.timeoutsPerHalf;
    const halftimeInput = document.getElementById('setupHalftime');
    if (halftimeInput) halftimeInput.value = this.gameSettings.halftimeDuration;
    const halftimeDurationInput = document.getElementById('setupHalftimeDuration');
    if (halftimeDurationInput) halftimeDurationInput.value = this.gameSettings.halftimeBreakDuration;

    this.updateTeamsDisplay();
    this.autoSave();
    this.closeSetupPopup();
    Utils.showNotification('Setup updated.', 'success');
    this.maybeTriggerHalftimeByScore();
    this.maybeTriggerHalftimeByTime();
  }

  /**
   * Sync timer inputs and defaults with current settings
   */
  applyGameSettingsToUI() {
    this.timerManager.defaultMinutes = this.gameSettings.matchDuration;
    this.secondsTimer.defaultSeconds = this.gameSettings.timeoutDuration;

    const countdownTimeInput = document.getElementById('countdownTime');
    if (countdownTimeInput) countdownTimeInput.value = this.gameSettings.matchDuration;

    const countdownTimeSecInput = document.getElementById('countdownTimeSec');
    if (countdownTimeSecInput) countdownTimeSecInput.value = this.gameSettings.timeoutDuration;

    const halftimeInput = document.getElementById('setupHalftime');
    if (halftimeInput) halftimeInput.value = this.gameSettings.halftimeDuration;

    const halftimeDurationInput = document.getElementById('setupHalftimeDuration');
    if (halftimeDurationInput) halftimeDurationInput.value = this.gameSettings.halftimeBreakDuration;

    if (typeof this.timerManager.updateDisplay === 'function') {
      this.timerManager.updateDisplay();
    }
    if (typeof this.secondsTimer.updateDisplay === 'function') {
      this.secondsTimer.updateDisplay();
    }

    this.updateTimeoutUI();
  }

  /**
   * Delete current score (from edit popup)
   */
  handleDeleteScore() {
    const scoreID = this.currentEditID;
    if (!scoreID) {
      Utils.showNotification('No score selected to delete.', 'error');
      return;
    }

    // Remove from data manager
    const removed = this.dataManager.removeScoreLog(scoreID);
    if (!removed) {
      Utils.showNotification('Could not delete score. Try again.', 'error');
      return;
    }

    // Remove row from DOM
    const row = document.querySelector(`tr[data-score-id="${scoreID}"]`);
    if (row && row.parentElement) {
      row.parentElement.removeChild(row);
    }

    // Rebuild table and counters from remaining logs
    this.rebuildTableAndCounters();

    this.closePopup();
    this.autoSave();
    Utils.showNotification('Score deleted.', 'success');
  }

  /**
   * Rebuild the scoring table and scoreboard counters from logs
   */
  rebuildTableAndCounters() {
    const scoringTableBody = document.getElementById('scoringTableBody');
    if (!scoringTableBody) return;

    // Reset counters
    this.teamAScore = 0;
    this.teamBScore = 0;

    // Clear table
    scoringTableBody.innerHTML = '';

    // Re-add rows in order, updating counters per log
    let scoringIndex = 0;
    this.dataManager.scoreLogs.forEach((logEntry) => {
      const isScore = this.isScoreLog(logEntry);
      let abbaIndex = null;
      if (isScore) {
        const teamLetter = this.getTeamLetterFromLog(logEntry);
        if (teamLetter === 'A') this.teamAScore++;
        else if (teamLetter === 'B') this.teamBScore++;
        abbaIndex = scoringIndex;
        scoringIndex++;
      }
      const row = this.createScoreRow(logEntry, abbaIndex);
      if (row) {
        if (scoringTableBody.firstChild) {
          scoringTableBody.insertBefore(row, scoringTableBody.firstChild);
        } else {
          scoringTableBody.appendChild(row);
        }
      }
    });

    // Ensure ABBA column matches
    this.updateAbbaColumn();
    this.setAbbaVisibility(this.abbaStart !== 'NONE');
    this.checkForScoreCap({ silent: true });
    this.updateHalftimeTracking();
    this.maybeTriggerHalftimeByScore();
  }

  /**
   * Handle timer toggle
   */
  handleTimerToggle() {
    if (this.gameStoppageActive && !this.timerManager.isRunning) {
      Utils.showNotification('Resolve game stoppage before starting the game timer.', 'error');
      return;
    }
    if (this.hardCapReached && !this.timerManager.isRunning) {
      Utils.showNotification('Score cap reached. Timers remain paused.', 'warning');
      return;
    }
    this.timerManager.toggle();
  }

  /**
   * Handle timer reset
   */
  handleTimerReset() {
    const countdownTimeInput = document.getElementById('countdownTime');
    const newTime = parseInt(countdownTimeInput?.value, 10) || CONFIG.DEFAULT_TIMER_MINUTES;
    this.timerManager.reset(newTime);
  }

  /**
   * Handle seconds timer toggle
   */
  handleSecTimerToggle() {
    if (this.gameStoppageActive && !this.secondsTimer.isRunning) {
      Utils.showNotification('Resolve game stoppage before starting the timeout timer.', 'error');
      return;
    }
    if (this.hardCapReached && !this.secondsTimer.isRunning) {
      Utils.showNotification('Score cap reached. Timers remain paused.', 'warning');
      return;
    }
    this.secondsTimer.toggle();
  }

  /**
   * Handle seconds timer reset
   */
  handleSecTimerReset() {
    const secInput = document.getElementById('countdownTimeSec');
    const secs = parseInt(secInput?.value, 10) || this.secondsTimer.defaultSeconds;
    this.secondsTimer.reset(secs);
  }

  /**
   * Handle score submission
   */
  async handleSubmitScore() {
    const scoreLogs = this.dataManager.scoreLogs;
    
    if (scoreLogs.length === 0) {
      Utils.showNotification('No scores have been logged.', 'error');
      return;
    }

    const teamAName = document.getElementById('teamA')?.value || '';
    const teamBName = document.getElementById('teamB')?.value || '';
    const gameID = `${teamAName} vs ${teamBName}`;
    const dateStr = new Date().toLocaleDateString();
    // Build CSV content from logs
    const header = ['GameID', 'Time', 'Event', 'Team', 'Score', 'Assist'];
    const lines = [Utils.toCSVLine(header)];
    scoreLogs.forEach((log) => {
      const eventType = log.EventType || this.getEventTypeLabel(log.Type);
      lines.push(Utils.toCSVLine([
        log.GameID || gameID,
        log.Time || '',
        eventType || '',
        log.Team || '',
        log.Score || '',
        log.Assist || ''
      ]));
    });

    const csv = lines.join('\r\n');
    const filename = `${Utils.sanitizeFilename(gameID || 'Game')}.csv`;

    // Build export payload for Google Apps Script doPost
    const payload = {
      GameID: gameID,
      Date: dateStr,
      logs: scoreLogs.map((log) => ({
        GameID: log.GameID || gameID,
        Time: log.Time || '',
        Event: log.EventType || this.getEventTypeLabel(log.Type),
        Team: log.Team || '',
        Score: log.Score || '',
        Assist: log.Assist || ''
      }))
    };

    // Try to export to Google Sheets (if SUBMIT_URL configured)
    try {
      this.loadingManager.start();
      const ok = await this.apiManager.submitScores(payload);
      if (ok) {
        Utils.showNotification('Data has been successfully exported to Google Sheets!', 'success');
      }
    } catch (err) {
      Utils.showNotification(`Export to Google Sheets failed: ${err.message}`, 'error');
    } finally {
      this.loadingManager.stop();
    }

    // Always download CSV locally as well
    Utils.downloadTextFile(filename, csv);
    
    // Clear logs and table after actions
    this.dataManager.clearScoreLogs();
    this.rebuildTableAndCounters();
    this.currentEditID = null;
    this.currentHalftimeEditID = null;
    this.halftimeTriggered = false;
    this.halftimePendingReason = null;
    this.halftimeAutoSuppressed = false;
    this.halftimeReasonResolved = null;

    this.initializeTimeoutState();
    this.matchStarted = false;
    this.gameStoppageActive = false;
    this.hardCapReached = false;
    this.updateStoppageUI();
    this.updateMatchControls();
    this.dataManager.updateGameState({
      teamAScore: 0,
      teamBScore: 0,
      scoreLogs: [],
      stoppageActive: false,
      timeoutState: this.getTimeoutStateSnapshot(),
      matchStarted: this.matchStarted,
      timestamp: Date.now()
    });
    this.dataManager.saveCurrentState();

    Utils.showNotification(`CSV downloaded: ${filename}`, 'success');
  }
}

// =====================================================
// APPLICATION INITIALIZATION
// =====================================================
let app;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    app = new ScorekeeperApp();
    await app.init();
  } catch (error) {
    console.error('Failed to initialize application:', error);
    Utils.showNotification('Failed to initialize application. Please refresh the page.', 'error');
  }
});

// Make app instance available globally for debugging
window.ScorekeeperApp = app;
