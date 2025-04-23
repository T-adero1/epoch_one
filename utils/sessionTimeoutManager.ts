/**
 * Session Timeout Manager
 * 
 * Manages user session timeouts based on inactivity and absolute session duration.
 * Tracks user activity through page navigation and interaction events.
 */

import { clearSession, refreshSession, loadSession } from './sessionManager';
import { clearZkLoginState } from './zkLogin';
import { createLogger } from './logger';

const logger = createLogger('SessionTimeout');

// Configuration
const DEFAULT_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const DEFAULT_SESSION_MAX_DURATION = 24 * 60 * 60 * 1000; // 24 hours (updated from 12)
const DEFAULT_WARNING_BEFORE_TIMEOUT = 60 * 1000; // 1 minute
const LOCALSTORAGE_LAST_ACTIVITY = 'epoch_last_activity';
const LOCALSTORAGE_SESSION_START = 'epoch_session_start';
const LOCALSTORAGE_SESSION_ID = 'epoch_session_id'; // For tracking session instances
const DEBUG_ENABLED = process.env.NODE_ENV !== 'production'; // Automatically disable in production

// Callback types
type TimeoutCallback = () => void;
type WarningCallback = (remainingMs: number) => void;

// State
let inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
let warningTimeout: ReturnType<typeof setTimeout> | null = null;
let absoluteSessionTimeout: ReturnType<typeof setTimeout> | null = null;
let activityListenersAttached = false;
let timeoutCallback: TimeoutCallback | null = null;
let warningCallback: WarningCallback | null = null;
let activityEvents = ['click', 'touchstart', 'keydown', 'mousedown'];
let sessionId = '';
let lastActivityLogged = 0; // To prevent excessive activity logging
let lastWarningTime = 0; // To prevent duplicate warnings

// Configuration object
interface TimeoutConfig {
  inactivityTimeout?: number;
  sessionMaxDuration?: number;
  warningBeforeTimeout?: number;
  onTimeout?: TimeoutCallback;
  onWarning?: WarningCallback;
  activityEvents?: string[];
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format time in a human-readable format
 */
function formatTime(ms: number): string {
  if (ms <= 0) return '0s';
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0) result += `${minutes}m `;
  result += `${seconds}s`;
  
  return result;
}

/**
 * Enhanced logging with session context
 */
function logWithTimestamp(message: string, data?: any): void {
  if (!DEBUG_ENABLED) return;
  
  const sid = sessionId ? `[${sessionId.slice(-6)}]` : '';
  const sessionContext = { sessionId: sid };
  
  if (data) {
    logger.debug(`${message}`, { ...sessionContext, ...data });
  } else {
    logger.debug(`${message}`, sessionContext);
  }
}

/**
 * Log timer status
 */
function logTimerStatus(event: string): void {
  if (!DEBUG_ENABLED) return;
  
  // Get remaining times
  const times = getTimeUntilExpiration();
  const inactivityFormatted = formatTime(times.inactivity);
  const sessionFormatted = formatTime(times.session);
  
  logger.debug(`${event} - Status: inactivity timeout in ${inactivityFormatted}, session expires in ${sessionFormatted}`, {
    sessionId: sessionId.slice(-6),
    hasInactivityTimer: inactivityTimeout !== null,
    hasWarningTimer: warningTimeout !== null,
    hasAbsoluteTimer: absoluteSessionTimeout !== null
  });
}

/**
 * Initialize the session timeout manager
 */
export function initSessionTimeout(config?: TimeoutConfig): void {
  if (typeof window === 'undefined') return;

  // Generate and store a unique session ID if not exists
  if (!localStorage.getItem(LOCALSTORAGE_SESSION_ID)) {
    sessionId = generateSessionId();
    localStorage.setItem(LOCALSTORAGE_SESSION_ID, sessionId);
  } else {
    sessionId = localStorage.getItem(LOCALSTORAGE_SESSION_ID) || generateSessionId();
  }

  logger.info('Initializing session timeout manager', {
    sessionId: sessionId.slice(-6),
    inactivityTimeout: formatTime(config?.inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT),
    sessionMaxDuration: formatTime(config?.sessionMaxDuration ?? DEFAULT_SESSION_MAX_DURATION),
    warningTime: formatTime(config?.warningBeforeTimeout ?? DEFAULT_WARNING_BEFORE_TIMEOUT)
  });

  // Clear any existing timeouts to prevent duplicates
  resetTimers('initialization');

  // Set configuration
  const inactivityMs = config?.inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT;
  const maxDurationMs = config?.sessionMaxDuration ?? DEFAULT_SESSION_MAX_DURATION;
  const warningMs = config?.warningBeforeTimeout ?? DEFAULT_WARNING_BEFORE_TIMEOUT;

  if (config?.onTimeout) {
    timeoutCallback = config.onTimeout;
    logger.debug('Timeout callback registered');
  }

  if (config?.onWarning) {
    warningCallback = config.onWarning;
    logger.debug('Warning callback registered');
  }

  if (config?.activityEvents) {
    activityEvents = config.activityEvents;
    logger.debug('Custom activity events registered', { events: activityEvents });
  }

  // Initialize session start time if not exists
  if (!localStorage.getItem(LOCALSTORAGE_SESSION_START)) {
    localStorage.setItem(LOCALSTORAGE_SESSION_START, Date.now().toString());
    logger.debug('Created new session start timestamp');
  } else {
    logger.debug('Using existing session start timestamp');
  }

  // Set up the absolute session timeout
  const sessionStartTime = parseInt(localStorage.getItem(LOCALSTORAGE_SESSION_START) || Date.now().toString(), 10);
  const elapsedTime = Date.now() - sessionStartTime;
  const remainingSessionTime = Math.max(0, maxDurationMs - elapsedTime);

  logger.debug('Session time calculation', {
    sessionId: sessionId.slice(-6),
    sessionStartTime: new Date(sessionStartTime).toISOString(),
    elapsedTime: formatTime(elapsedTime),
    remainingTime: formatTime(remainingSessionTime)
  });

  if (remainingSessionTime <= 0) {
    // Session already expired
    logger.warn('Maximum session duration exceeded on initialization');
    handleSessionTimeout('max duration exceeded');
  } else {
    // Set timeout for remaining session time
    absoluteSessionTimeout = setTimeout(() => {
      logger.warn('Maximum session duration reached - absolute timeout triggered');
      handleSessionTimeout('max duration reached');
    }, remainingSessionTime);

    logger.info(`Session will expire in ${formatTime(remainingSessionTime)}`);
    
    // Initialize activity tracking
    recordUserActivity('initialization');
    initInactivityTimer(inactivityMs, warningMs);
    attachActivityListeners();
  }

  logger.info('Session timeout initialized', { 
    sessionId: sessionId.slice(-6),
    warningTime: formatTime(warningMs),
    timeoutTime: formatTime(inactivityMs),
    maxDuration: formatTime(maxDurationMs)
  });
}

/**
 * Record current time as last user activity
 */
export function recordUserActivity(source: string = 'user'): void {
  if (typeof window === 'undefined') return;

  const currentTime = Date.now();
  
  // Only log if it's a significant activity or enough time has passed since last log
  // This prevents log spam from rapid events
  if (DEBUG_ENABLED && (source !== 'user' || currentTime - lastActivityLogged > 5000)) {
    logWithTimestamp(`Activity recorded: ${source}`);
    lastActivityLogged = currentTime;
  }
  
  localStorage.setItem(LOCALSTORAGE_LAST_ACTIVITY, currentTime.toString());
  
  // Restart inactivity timer
  if (timeoutCallback) {
    resetInactivityTimer(source);
  }

  logger.debug('User activity recorded');
}

/**
 * Set up activity listeners to track user interaction
 */
function attachActivityListeners(): void {
  if (typeof window === 'undefined' || activityListenersAttached) return;

  const activityHandler = (event: Event) => {
    recordUserActivity(event.type);
  };

  // Add event listeners for user activity
  activityEvents.forEach(eventType => {
    window.addEventListener(eventType, activityHandler, { passive: true });
  });

  // Track page navigation via route changes
  if (typeof window !== 'undefined') {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      recordUserActivity('navigation:pushState');
      return originalPushState.apply(this, args);
    };

    history.replaceState = function(...args) {
      recordUserActivity('navigation:replaceState');
      return originalReplaceState.apply(this, args);
    };

    window.addEventListener('popstate', () => recordUserActivity('navigation:popstate'));
  }

  activityListenersAttached = true;
  logger.debug('Activity tracking initialized', { 
    sessionId: sessionId?.slice(-6),
    events: activityEvents 
  });
}

/**
 * Initialize the inactivity timer (first time setup)
 */
function initInactivityTimer(timeout: number, warningTime: number): void {
  logger.debug(`Initializing inactivity timer: timeout=${formatTime(timeout)}, warning=${formatTime(warningTime)}`, { sessionId: sessionId?.slice(-6) });
  
  // Set up warning timeout
  const warningDelay = Math.max(0, timeout - warningTime);
  if (warningDelay > 0 && warningCallback) {
    logger.debug(`Setting warning timer to trigger in ${formatTime(warningDelay)}`, { sessionId: sessionId?.slice(-6) });
    warningTimeout = setTimeout(() => {
      const currentTime = Date.now();
      // Prevent duplicate warnings
      if (currentTime - lastWarningTime < warningTime / 2) {
        logger.debug('Skipping duplicate warning', { sessionId: sessionId?.slice(-6) });
        return;
      }
      
      lastWarningTime = currentTime;
      logger.info(`Warning triggered - Session will expire in ${formatTime(warningTime)}`, { sessionId: sessionId?.slice(-6) });
      if (warningCallback) warningCallback(warningTime);
    }, warningDelay);
  }

  // Set up inactivity timeout
  logger.debug(`Setting inactivity timer to expire in ${formatTime(timeout)}`, { sessionId: sessionId?.slice(-6) });
  inactivityTimeout = setTimeout(() => {
    logger.warn('Inactivity timeout triggered', { sessionId: sessionId?.slice(-6) });
    handleSessionTimeout('inactivity');
  }, timeout);
}

/**
 * Start or restart the inactivity timer
 */
function startInactivityTimer(timeout: number, warningTime: number): void {
  if (typeof window === 'undefined') return;
  
  logger.debug('Starting inactivity timer', { 
    sessionId: sessionId?.slice(-6),
    timeoutMinutes: timeout / (60 * 1000), 
    warningSeconds: warningTime / 1000
  });

  // Clear any existing timers first
  resetInactivityTimer('timer restart');
  
  // Calculate when to show the warning - this is (timeout - warningTime) ms from now
  const timeUntilWarning = Math.max(0, timeout - warningTime);
  
  // Start warning timer if warning time is greater than 0
  if (timeUntilWarning > 0 && warningCallback) {
    warningTimeout = setTimeout(() => {
      // Only show warning if needed
      const currentTime = Date.now();
      const lastActivity = parseInt(localStorage.getItem(LOCALSTORAGE_LAST_ACTIVITY) || '0', 10);
      const inactiveTime = currentTime - lastActivity;
      
      // Check if we're still inactive - prevents false warnings 
      // if the user was active while the timer was running
      if (inactiveTime >= timeUntilWarning) {
        logger.debug('Inactivity warning triggered', { sessionId: sessionId?.slice(-6) });
        
        // Avoid duplicate warnings
        if (currentTime - lastWarningTime > warningTime) {
          lastWarningTime = currentTime;
          
          // Call the warning callback with the remaining time (which is the warning duration)
          //warningCallback(warningTime);
        }
        
        // Set the final timeout after warning
        inactivityTimeout = setTimeout(() => {
          logger.warn('Inactivity timeout triggered', { sessionId: sessionId?.slice(-6) });
          handleSessionTimeout('inactivity timeout');
        }, warningTime);
      } else {
        // User was active during the timer - reset timers
        logger.debug('Skipping warning, user was active recently', { sessionId: sessionId?.slice(-6) });
        resetInactivityTimer('recent activity');
      }
    }, timeUntilWarning);
  } else {
    // No warning, just set the timeout directly
    inactivityTimeout = setTimeout(() => {
      logger.warn('Inactivity timeout triggered (no warning)', { sessionId: sessionId?.slice(-6) });
      handleSessionTimeout('inactivity timeout');
    }, timeout);
  }
}

/**
 * Reset inactivity timers
 */
function resetInactivityTimer(source: string = 'manual'): void {
  logger.debug(`Resetting inactivity timer (source: ${source})`, { sessionId: sessionId?.slice(-6) });

  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
    logger.debug('Cleared existing inactivity timer', { sessionId: sessionId?.slice(-6) });
  }
  
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
    logger.debug('Cleared existing warning timer', { sessionId: sessionId?.slice(-6) });
  }

  // Restart the timers with the appropriate timeouts
  // Using direct timeout setup to avoid circular dependency with startInactivityTimer
  const config = getConfig();
  if (timeoutCallback) {
    const inactivityTimeoutMs = config.inactivityTimeout;
    const warningTimeMs = config.warningBeforeTimeout;
    
    // Set up warning timeout
    const warningDelay = Math.max(0, inactivityTimeoutMs - warningTimeMs);
    if (warningDelay > 0 && warningCallback) {
      logger.debug(`Setting warning timer to trigger in ${formatTime(warningDelay)}`, { sessionId: sessionId?.slice(-6) });
      warningTimeout = setTimeout(() => {
        const currentTime = Date.now();
        // Prevent duplicate warnings
        if (currentTime - lastWarningTime < warningTimeMs / 2) {
          logger.debug('Skipping duplicate warning', { sessionId: sessionId?.slice(-6) });
          return;
        }
        
        lastWarningTime = currentTime;
        logger.info(`Warning triggered - Session will expire in ${formatTime(warningTimeMs)}`, { sessionId: sessionId?.slice(-6) });
        if (warningCallback) warningCallback(warningTimeMs);
      }, warningDelay);
    }

    // Set up inactivity timeout
    logger.debug(`Setting inactivity timer to expire in ${formatTime(inactivityTimeoutMs)}`, { sessionId: sessionId?.slice(-6) });
    inactivityTimeout = setTimeout(() => {
      logger.warn('Inactivity timeout triggered', { sessionId: sessionId?.slice(-6) });
      handleSessionTimeout('inactivity');
    }, inactivityTimeoutMs);
  }
}

/**
 * Reset all timers
 */
function resetTimers(source: string = 'manual'): void {
  logger.debug(`Resetting all timers (source: ${source})`, { sessionId: sessionId?.slice(-6) });

  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
    logger.debug('Cleared inactivity timer', { sessionId: sessionId?.slice(-6) });
  }
  
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
    logger.debug('Cleared warning timer', { sessionId: sessionId?.slice(-6) });
  }
  
  if (absoluteSessionTimeout) {
    clearTimeout(absoluteSessionTimeout);
    absoluteSessionTimeout = null;
    logger.debug('Cleared absolute session timer', { sessionId: sessionId?.slice(-6) });
  }
}

/**
 * Handle session timeout
 */
function handleSessionTimeout(reason: string = 'unknown'): void {
  logger.warn(`Session timeout triggered (reason: ${reason})`, { sessionId: sessionId?.slice(-6) });
  
  resetTimers('timeout');

  // If we have a timeout callback registered (from AppState), use it
  // This will call the same logout flow as the sign out button
  if (timeoutCallback) {
    logger.debug('Executing timeout callback - this will use the same workflow as manual logout', { sessionId: sessionId?.slice(-6) });
    timeoutCallback();
    return; // Exit early, letting the AppState handle the logout
  }
  
  // Fallback behavior if no callback is configured
  logger.debug('No timeout callback registered, using default logout behavior', { sessionId: sessionId?.slice(-6) });
  
  // Create the redirect URL that will be used after page refresh
  const redirectParam = reason === 'max duration reached' ? 'expired=1' : 'timeout=1';
  const loginUrl = `/login?${redirectParam}`;
  
  // 1. First clear all session state synchronously
  // Clear user session
  clearSession();
  logger.debug('Session cleared', { sessionId: sessionId?.slice(-6) });
  
  // 2. Clear zkLogin state to prevent automatic re-authentication
  try {
    clearZkLoginState();
    logger.debug('ZkLogin state cleared', { sessionId: sessionId?.slice(-6) });
  } catch (e) {
    logger.error('Error clearing ZkLogin state', { sessionId: sessionId?.slice(-6), error: e });
  }
  
  // 3. Reset session start time and all related localStorage items
  localStorage.removeItem(LOCALSTORAGE_SESSION_START);
  localStorage.removeItem(LOCALSTORAGE_LAST_ACTIVITY);
  localStorage.removeItem(LOCALSTORAGE_SESSION_ID);
  
  // 4. Store the redirect destination for after refresh
  localStorage.setItem('redirectAfterRefresh', loginUrl);
  localStorage.setItem('sessionTimedOut', 'true'); // Add an explicit flag for timing out
  
  logger.debug('Session timestamps and IDs removed', { sessionId: sessionId?.slice(-6) });
  
  // Default behavior: redirect to login page
  if (typeof window !== 'undefined') {
    logger.debug('Triggering page refresh', { sessionId: sessionId?.slice(-6) });
    
    // Force a complete page refresh
    window.location.href = loginUrl;
  }
}

/**
 * Check if session is about to expire and return remaining time
 */
export function getTimeUntilExpiration(): { inactivity: number, session: number } {
  if (typeof window === 'undefined') {
    return { inactivity: 0, session: 0 };
  }

  const config = getConfig();
  const lastActivity = parseInt(localStorage.getItem(LOCALSTORAGE_LAST_ACTIVITY) || Date.now().toString(), 10);
  const sessionStart = parseInt(localStorage.getItem(LOCALSTORAGE_SESSION_START) || Date.now().toString(), 10);
  
  const inactivityTime = Date.now() - lastActivity;
  const sessionTime = Date.now() - sessionStart;
  
  const remainingInactivity = Math.max(0, config.inactivityTimeout - inactivityTime);
  const remainingSession = Math.max(0, config.sessionMaxDuration - sessionTime);
  
  return {
    inactivity: remainingInactivity,
    session: remainingSession
  };
}

/**
 * Debug function to output the current state of the session timeout manager
 */
export function debugSessionStatus(): void {
  if (!DEBUG_ENABLED) return;
  
  const times = getTimeUntilExpiration();
  const lastActivity = parseInt(localStorage.getItem(LOCALSTORAGE_LAST_ACTIVITY) || '0', 10);
  const sessionStart = parseInt(localStorage.getItem(LOCALSTORAGE_SESSION_START) || '0', 10);
  
  logger.debug('Session Status', {
    sessionId: sessionId?.slice(-6),
    timers: {
      hasInactivityTimer: inactivityTimeout !== null,
      hasWarningTimer: warningTimeout !== null,
      hasAbsoluteTimer: absoluteSessionTimeout !== null
    },
    timestamps: {
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : 'not set',
      sessionStart: sessionStart ? new Date(sessionStart).toISOString() : 'not set',
      idleFor: formatTime(Date.now() - lastActivity),
      sessionAge: formatTime(Date.now() - sessionStart)
    },
    remaining: {
      inactivity: formatTime(times.inactivity),
      session: formatTime(times.session)
    },
    configuration: getConfig(),
    listeners: {
      activityListenersAttached,
      activeEvents: activityEvents
    }
  });
}

/**
 * Extend the session (e.g. after user confirms they want to stay active)
 */
export function extendSession(): void {
  if (typeof window === 'undefined') return;
  
  logger.debug('Session extended by user', { sessionId: sessionId?.slice(-6) });
  recordUserActivity('manual-extend');
  
  // Refresh the session in the backend/storage
  const session = loadSession();
  if (session && session.isAuthenticated) {
    refreshSession();
    logger.debug('Session refreshed in storage', { sessionId: sessionId?.slice(-6) });
  }
}

/**
 * End the session (typically called on logout)
 */
export function endSession(): void {
  logger.debug('Session ended manually', { sessionId: sessionId?.slice(-6) });
  handleSessionTimeout('manual-logout');
}

/**
 * Clean up event listeners and timers
 */
export function cleanup(): void {
  logger.debug('Cleaning up session timeout manager', { sessionId: sessionId?.slice(-6) });
  
  resetTimers('cleanup');
  
  if (typeof window !== 'undefined' && activityListenersAttached) {
    const activityHandler = () => {
      recordUserActivity();
    };
    
    activityEvents.forEach(eventType => {
      window.removeEventListener(eventType, activityHandler);
    });
    
    window.removeEventListener('popstate', activityHandler);
    activityListenersAttached = false;
    
    logger.debug('Activity listeners removed', { sessionId: sessionId?.slice(-6) });
  }
}

/**
 * Get current configuration
 */
function getConfig(): Required<Omit<TimeoutConfig, 'onTimeout' | 'onWarning' | 'activityEvents'>> {
  return {
    inactivityTimeout: DEFAULT_INACTIVITY_TIMEOUT,
    sessionMaxDuration: DEFAULT_SESSION_MAX_DURATION,
    warningBeforeTimeout: DEFAULT_WARNING_BEFORE_TIMEOUT,
  };
}

// Add a utility function to check for pending redirects after refresh
export function checkForPendingRedirect(): void {
  if (typeof window === 'undefined') return;
  
  // Check if we just timed out
  const wasTimedOut = localStorage.getItem('sessionTimedOut') === 'true';
  
  // Look for the pending redirect
  const pendingRedirect = localStorage.getItem('redirectAfterRefresh');
  
  if (pendingRedirect) {
    logger.debug(`Found pending redirect after refresh: ${pendingRedirect}`, { sessionId: sessionId?.slice(-6) });
    
    // Clear these flags immediately to prevent redirect loops
    localStorage.removeItem('redirectAfterRefresh');
    localStorage.removeItem('sessionTimedOut');
    
    // Double check that all session data is cleared if we came from a timeout
    if (wasTimedOut) {
      // Ensure any lingering session data is fully cleared
      clearSession();
      
      try {
        clearZkLoginState();
      } catch (e) {
        // Already handled, just continue
      }
      
      // Clear any other session-related data
      localStorage.removeItem(LOCALSTORAGE_SESSION_START);
      localStorage.removeItem(LOCALSTORAGE_LAST_ACTIVITY);
      localStorage.removeItem(LOCALSTORAGE_SESSION_ID);
      
      logger.debug('Re-confirmed all session data cleared after timeout', { sessionId: sessionId?.slice(-6) });
    }
    
    // Do the redirect
    window.location.href = pendingRedirect;
  }
}

function startWatchingForInactivity() {
  logger.debug('Started watching for inactivity', { sessionId: sessionId?.slice(-6) });
}

function stopWatchingForInactivity() {
  logger.debug('Stopped watching for inactivity', { sessionId: sessionId?.slice(-6) });
}

function handleWarningTimeout() {
  logger.warn('Session warning timeout triggered', { sessionId: sessionId?.slice(-6) });
}

function updateLastActivity() {
  logger.debug('Last activity timestamp updated', { sessionId: sessionId?.slice(-6) });
} 