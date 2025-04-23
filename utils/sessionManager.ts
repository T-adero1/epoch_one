// Session management utility for Epoch One application
// This handles user sessions, authentication state, and session persistence

type SessionState = {
  isAuthenticated: boolean;
  userId?: string;
  userAddress?: string;
  email?: string;
  name?: string;
  profileImage?: string;
  sessionToken?: string;
  expiresAt?: number;
  lastActive?: number;
  deviceId?: string;
};

// Storage keys
const SESSION_STORAGE_KEY = 'epoch_one_session';
const DEVICE_ID_KEY = 'epoch_one_device_id';

// Session configuration
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
const ACTIVITY_TRACKING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_REFRESH_THRESHOLD_MS = 1 * 60 * 60 * 1000; // 1 hour - refresh if less than this time remaining

// Listeners for session changes
const listeners: ((state: SessionState) => void)[] = [];

/**
 * Creates a new device ID or retrieves the existing one
 */
function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Initialize a new session
 */
export function initSession(userData: Partial<SessionState> = {}): SessionState {
  const now = Date.now();
  const deviceId = getOrCreateDeviceId();
  
  const session: SessionState = {
    isAuthenticated: false,
    lastActive: now,
    deviceId,
    ...userData
  };
  
  if (userData.isAuthenticated) {
    session.expiresAt = now + SESSION_DURATION_MS;
  }
  
  saveSession(session);
  return session;
}

/**
 * Load the current session from storage
 */
export function loadSession(): SessionState {
  if (typeof window === 'undefined') {
    return { isAuthenticated: false };
  }
  
  try {
    const sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionData) {
      return initSession();
    }
    
    const session = JSON.parse(sessionData) as SessionState;
    
    // Check session expiry
    if (session.expiresAt && session.expiresAt < Date.now()) {
      console.log('🔐 Session: Session expired, cleaning up');
      clearSession();
      return initSession();
    }
    
    // Update last active time
    updateLastActive(session);
    
    return session;
  } catch (error) {
    console.error('🔐 Session: Error loading session', error);
    return initSession();
  }
}

/**
 * Save the session to storage
 */
export function saveSession(session: SessionState): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    notifyListeners(session);
  } catch (error) {
    console.error('🔐 Session: Error saving session', error);
  }
}

/**
 * Clear the current session
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(SESSION_STORAGE_KEY);
  const emptySession = initSession();
  notifyListeners(emptySession);
}

/**
 * Update session with authentication data
 */
export function authenticateSession(userData: Partial<SessionState>): SessionState {
  const currentSession = loadSession();
  const now = Date.now();
  
  const updatedSession: SessionState = {
    ...currentSession,
    ...userData,
    isAuthenticated: true,
    lastActive: now,
    expiresAt: now + SESSION_DURATION_MS
  };
  
  saveSession(updatedSession);
  return updatedSession;
}

/**
 * Update the last active timestamp
 */
function updateLastActive(session: SessionState): void {
  // Only update if it's been more than the tracking interval
  const now = Date.now();
  if (!session.lastActive || (now - session.lastActive) > ACTIVITY_TRACKING_INTERVAL_MS) {
    session.lastActive = now;
    saveSession(session);
  }
}

/**
 * Check if session needs to be refreshed
 */
export function shouldRefreshSession(session: SessionState): boolean {
  if (!session.isAuthenticated || !session.expiresAt) return false;
  
  const timeRemaining = session.expiresAt - Date.now();
  return timeRemaining < SESSION_REFRESH_THRESHOLD_MS && timeRemaining > 0;
}

/**
 * Refresh the session expiry
 */
export function refreshSession(): SessionState {
  const currentSession = loadSession();
  if (!currentSession.isAuthenticated) return currentSession;
  
  const now = Date.now();
  currentSession.expiresAt = now + SESSION_DURATION_MS;
  currentSession.lastActive = now;
  
  saveSession(currentSession);
  return currentSession;
}

/**
 * Subscribe to session changes
 */
export function subscribeToSessionChanges(callback: (state: SessionState) => void): () => void {
  listeners.push(callback);
  
  // Return unsubscribe function
  return () => {
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of session changes
 */
function notifyListeners(session: SessionState): void {
  listeners.forEach(listener => {
    try {
      listener(session);
    } catch (error) {
      console.error('🔐 Session: Error in session change listener', error);
    }
  });
}

/**
 * Set up activity tracking
 */
export function setupActivityTracking(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  
  const activityHandler = () => {
    const session = loadSession();
    if (session.isAuthenticated) {
      updateLastActive(session);
    }
  };
  
  // Add event listeners
  events.forEach(event => {
    window.addEventListener(event, activityHandler, { passive: true });
  });
  
  // Return cleanup function
  return () => {
    events.forEach(event => {
      window.removeEventListener(event, activityHandler);
    });
  };
}

// Initialize session system
export function initializeSessionSystem(): void {
  if (typeof window === 'undefined') return;
  
  // Load session on initialization
  loadSession();
  
  // Set up periodic session check
  const intervalId = setInterval(() => {
    const session = loadSession();
    
    // Check if session has expired
    if (session.isAuthenticated && session.expiresAt && session.expiresAt < Date.now()) {
      console.log('🔐 Session: Session expired during periodic check');
      clearSession();
    }
    
    // Auto-refresh if needed
    if (shouldRefreshSession(session)) {
      console.log('🔐 Session: Auto-refreshing session');
      refreshSession();
    }
  }, 60000); // Check every minute
  
  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(intervalId);
  });
} 