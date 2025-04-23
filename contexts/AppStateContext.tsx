'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { 
  loadSession, 
  saveSession, 
  clearSession, 
  authenticateSession, 
  subscribeToSessionChanges,
  setupActivityTracking,
  initializeSessionSystem,
  refreshSession,
  type SessionState
} from '@/utils/sessionManager';
import { 
  initSessionTimeout, 
  endSession, 
  extendSession,
  cleanup as cleanupSessionTimeout
} from '@/utils/sessionTimeoutManager';
import { useRouter } from 'next/navigation';

// Define the global application state
interface AppState {
  session: SessionState & {
    passwordVerified?: boolean;
  };
  userProfile: {
    fullName?: string;
    email?: string;
    avatarUrl?: string;
    walletAddress?: string;
    phoneNumber?: string;
    preferredLanguage?: string;
    dateFormat?: string;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
    lastLogin?: Date;
    lastSeen?: Date;
  };
  ui: {
    theme: 'light' | 'dark' | 'system';
    sidebarCollapsed: boolean;
    showNotifications: boolean;
    currentRoute?: string;
    notificationCount: number;
    isLoadingUser: boolean;
    isLoadingData: boolean;
    errors: {
      sessionError?: string;
      networkError?: string;
      lastError?: string;
    };
    sessionTimeout: {
      showWarning: boolean;
      warningTime: number;
      isTimingOut: boolean;
    };
  };
}

// Define the initial state
const initialState: AppState = {
  session: {
    isAuthenticated: false
  },
  userProfile: {
    notifications: {
      email: true,
      push: true,
      sms: false
    }
  },
  ui: {
    theme: 'system',
    sidebarCollapsed: false,
    showNotifications: false,
    notificationCount: 0,
    isLoadingUser: false,
    isLoadingData: false,
    errors: {},
    sessionTimeout: {
      showWarning: false,
      warningTime: 0,
      isTimingOut: false
    }
  }
};

// Action types for the reducer
type AppAction =
  | { type: 'SESSION_INITIALIZED'; payload: SessionState }
  | { type: 'SESSION_UPDATED'; payload: SessionState }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'USER_AUTHENTICATED'; payload: Partial<SessionState> }
  | { type: 'USER_LOGOUT' }
  | { type: 'PROFILE_LOADED'; payload: Partial<AppState['userProfile']> }
  | { type: 'PROFILE_UPDATED'; payload: Partial<AppState['userProfile']> }
  | { type: 'UI_THEME_CHANGED'; payload: AppState['ui']['theme'] }
  | { type: 'UI_TOGGLE_SIDEBAR' }
  | { type: 'UI_TOGGLE_NOTIFICATIONS' }
  | { type: 'UI_SET_ROUTE'; payload: string }
  | { type: 'UI_SET_NOTIFICATION_COUNT'; payload: number }
  | { type: 'UI_SET_LOADING_USER'; payload: boolean }
  | { type: 'UI_SET_LOADING_DATA'; payload: boolean }
  | { type: 'UI_SET_ERROR'; payload: { key: keyof AppState['ui']['errors']; value: string | undefined } }
  | { type: 'SESSION_TIMEOUT_WARNING_SHOW'; payload: number }
  | { type: 'SESSION_TIMEOUT_WARNING_HIDE' }
  | { type: 'SESSION_TIMEOUT_OCCURRED' };

// App state reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SESSION_INITIALIZED':
    case 'SESSION_UPDATED':
      return {
        ...state,
        session: {
          ...action.payload
        }
      };
    
    case 'SESSION_EXPIRED':
      return {
        ...state,
        session: {
          isAuthenticated: false
        }
      };
    
    case 'USER_AUTHENTICATED':
      return {
        ...state,
        session: {
          ...state.session,
          ...action.payload,
          isAuthenticated: true
        }
      };
    
    case 'USER_LOGOUT':
      return {
        ...initialState,
        ui: {
          ...state.ui
        }
      };
    
    case 'PROFILE_LOADED':
    case 'PROFILE_UPDATED':
      return {
        ...state,
        userProfile: {
          ...state.userProfile,
          ...action.payload
        }
      };
    
    case 'UI_THEME_CHANGED':
      return {
        ...state,
        ui: {
          ...state.ui,
          theme: action.payload
        }
      };
    
    case 'UI_TOGGLE_SIDEBAR':
      return {
        ...state,
        ui: {
          ...state.ui,
          sidebarCollapsed: !state.ui.sidebarCollapsed
        }
      };
    
    case 'UI_TOGGLE_NOTIFICATIONS':
      return {
        ...state,
        ui: {
          ...state.ui,
          showNotifications: !state.ui.showNotifications
        }
      };
    
    case 'UI_SET_ROUTE':
      return {
        ...state,
        ui: {
          ...state.ui,
          currentRoute: action.payload
        }
      };
    
    case 'UI_SET_NOTIFICATION_COUNT':
      return {
        ...state,
        ui: {
          ...state.ui,
          notificationCount: action.payload
        }
      };
    
    case 'UI_SET_LOADING_USER':
      return {
        ...state,
        ui: {
          ...state.ui,
          isLoadingUser: action.payload
        }
      };
    
    case 'UI_SET_LOADING_DATA':
      return {
        ...state,
        ui: {
          ...state.ui,
          isLoadingData: action.payload
        }
      };
    
    case 'UI_SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          errors: {
            ...state.ui.errors,
            [action.payload.key]: action.payload.value,
            lastError: action.payload.value || state.ui.errors.lastError
          }
        }
      };
    
    case 'SESSION_TIMEOUT_WARNING_SHOW':
      return {
        ...state,
        ui: {
          ...state.ui,
          sessionTimeout: {
            ...state.ui.sessionTimeout,
            showWarning: true,
            warningTime: action.payload,
            isTimingOut: false
          }
        }
      };
    
    case 'SESSION_TIMEOUT_WARNING_HIDE':
      return {
        ...state,
        ui: {
          ...state.ui,
          sessionTimeout: {
            ...state.ui.sessionTimeout,
            showWarning: false,
            isTimingOut: false
          }
        }
      };
    
    case 'SESSION_TIMEOUT_OCCURRED':
      return {
        ...state,
        ui: {
          ...state.ui,
          sessionTimeout: {
            ...state.ui.sessionTimeout,
            showWarning: false,
            isTimingOut: true
          }
        },
        session: {
          ...initialState.session
        }
      };
    
    default:
      return state;
  }
}

// Define the context type
interface AppContextType {
  state: AppState;
  login: (userData: Partial<SessionState>) => void;
  logout: () => void;
  updateProfile: (profileData: Partial<AppState['userProfile']>) => void;
  setTheme: (theme: AppState['ui']['theme']) => void;
  toggleSidebar: () => void;
  toggleNotifications: () => void;
  setCurrentRoute: (route: string) => void;
  setNotificationCount: (count: number) => void;
  setIsLoadingUser: (isLoading: boolean) => void;
  setIsLoadingData: (isLoading: boolean) => void;
  setError: (key: keyof AppState['ui']['errors'], value: string | undefined) => void;
  extendUserSession: () => void;
  showSessionWarning: (timeRemaining: number) => void;
  hideSessionWarning: () => void;
}

// Create the context
const AppStateContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const router = useRouter();

  // Initialize session system and activity tracking
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Set up session management
      initializeSessionSystem();
      
      // Load initial session
      const initialSession = loadSession();
      
      // Check if password is verified in localStorage
      const passwordVerified = localStorage.getItem('passwordVerified') === 'true';
      
      // Enhanced session with password verification
      const enhancedSession = {
        ...initialSession,
        passwordVerified
      };
      
      dispatch({ type: 'SESSION_INITIALIZED', payload: enhancedSession });
      
      // Set up activity tracking
      const cleanupActivityTracking = setupActivityTracking();
      
      // Subscribe to session changes
      const unsubscribe = subscribeToSessionChanges((sessionState) => {
        // Preserve password verification status through session updates
        const updatedSession = {
          ...sessionState,
          passwordVerified: localStorage.getItem('passwordVerified') === 'true'
        };
        
        dispatch({ type: 'SESSION_UPDATED', payload: updatedSession });
        
        // If session went from authenticated to not authenticated, redirect to login
        if (!sessionState.isAuthenticated && state.session.isAuthenticated) {
          router.push('/login?expired=1');
        }
      });
      
      // Cleanup when component unmounts
      return () => {
        unsubscribe();
        cleanupActivityTracking();
        cleanupSessionTimeout();
      };
    }
  }, [router]);

  // Set up session timeout management when user is authenticated
  useEffect(() => {
    if (typeof window !== 'undefined' && state.session.isAuthenticated) {
      // Initialize session timeout with callbacks
      initSessionTimeout({
        // Customize timeout durations (optional)
        inactivityTimeout: 15 * 60 * 1000, // 15 minutes
        sessionMaxDuration: 24 * 60 * 60 * 1000, // 24 hours
        warningBeforeTimeout: 60 * 1000, // 1 minute warning
        
        // Warning callback
        onWarning: (remainingMs) => {
          console.log('🕒 App State: Session timeout warning triggered', { remainingMs });
          dispatch({ type: 'SESSION_TIMEOUT_WARNING_SHOW', payload: remainingMs });
        },
        
        // Timeout callback
        onTimeout: () => {
          console.log('🕒 App State: Session timeout occurred');
          
          // Update the UI state to reflect the timeout
          dispatch({ type: 'SESSION_TIMEOUT_OCCURRED' });
          
          // Just mark the session as expired in our state
          // The sessionTimeoutManager will handle the actual logout,
          // session clearing, and redirect after page refresh
        }
      });
      
      return () => {
        // Clean up session timeout when user logs out
        cleanupSessionTimeout();
      };
    }
  }, [state.session.isAuthenticated, router]);

  // Load user profile if authenticated
  useEffect(() => {
    if (state.session.isAuthenticated && state.session.userId) {
      dispatch({ type: 'UI_SET_LOADING_USER', payload: true });
      
      // This would normally be an API call to load user profile data
      // Simulating with a timeout
      const timeout = setTimeout(() => {
        const mockProfile = {
          fullName: state.session.name || 'User',
          email: state.session.email,
          walletAddress: state.session.userAddress,
          lastLogin: new Date(),
          lastSeen: new Date()
        };
        
        dispatch({ type: 'PROFILE_LOADED', payload: mockProfile });
        dispatch({ type: 'UI_SET_LOADING_USER', payload: false });
      }, 500);
      
      return () => clearTimeout(timeout);
    }
  }, [state.session.isAuthenticated, state.session.userId]);

  // Context methods
  const login = (userData: Partial<SessionState>) => {
    dispatch({ type: 'UI_SET_LOADING_USER', payload: true });
    
    try {
      // Update the session
      const updatedSession = authenticateSession(userData);
      dispatch({ type: 'USER_AUTHENTICATED', payload: updatedSession });
      
      // Navigate to dashboard after successful login
      if (userData.isAuthenticated) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      dispatch({ 
        type: 'UI_SET_ERROR', 
        payload: { key: 'sessionError', value: 'Authentication failed' } 
      });
    } finally {
      dispatch({ type: 'UI_SET_LOADING_USER', payload: false });
    }
  };
  
  const logout = () => {
    console.log('🔒 AppState: Logging out user');
    
    // Call endSession to clean up session resources
    endSession();
    
    // Update local state
    dispatch({ type: 'USER_LOGOUT' });
    
    // Redirect to login page
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
  };
  
  const updateProfile = (profileData: Partial<AppState['userProfile']>) => {
    dispatch({ type: 'PROFILE_UPDATED', payload: profileData });
    
    // Here you would typically also update this on the server
    // For now we just refresh the session to update the timestamp
    if (state.session.isAuthenticated) {
      refreshSession();
    }
  };
  
  const setTheme = (theme: AppState['ui']['theme']) => {
    dispatch({ type: 'UI_THEME_CHANGED', payload: theme });
    
    // Persist theme preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme_preference', theme);
    }
  };
  
  const toggleSidebar = () => {
    dispatch({ type: 'UI_TOGGLE_SIDEBAR' });
  };
  
  const toggleNotifications = () => {
    dispatch({ type: 'UI_TOGGLE_NOTIFICATIONS' });
  };
  
  const setCurrentRoute = (route: string) => {
    dispatch({ type: 'UI_SET_ROUTE', payload: route });
  };
  
  const setNotificationCount = (count: number) => {
    dispatch({ type: 'UI_SET_NOTIFICATION_COUNT', payload: count });
  };
  
  const setIsLoadingUser = (isLoading: boolean) => {
    dispatch({ type: 'UI_SET_LOADING_USER', payload: isLoading });
  };
  
  const setIsLoadingData = (isLoading: boolean) => {
    dispatch({ type: 'UI_SET_LOADING_DATA', payload: isLoading });
  };
  
  const setError = (key: keyof AppState['ui']['errors'], value: string | undefined) => {
    dispatch({ type: 'UI_SET_ERROR', payload: { key, value } });
  };
  
  const extendUserSession = () => {
    extendSession();
    dispatch({ type: 'SESSION_TIMEOUT_WARNING_HIDE' });
  };
  
  const showSessionWarning = (timeRemaining: number) => {
    dispatch({ type: 'SESSION_TIMEOUT_WARNING_SHOW', payload: timeRemaining });
  };
  
  const hideSessionWarning = () => {
    dispatch({ type: 'SESSION_TIMEOUT_WARNING_HIDE' });
  };
  
  // Context value
  const contextValue: AppContextType = {
    state,
    login,
    logout,
    updateProfile,
    setTheme,
    toggleSidebar,
    toggleNotifications,
    setCurrentRoute,
    setNotificationCount,
    setIsLoadingUser,
    setIsLoadingData,
    setError,
    extendUserSession,
    showSessionWarning,
    hideSessionWarning
  };
  
  return (
    <AppStateContext.Provider value={contextValue}>
      {children}
    </AppStateContext.Provider>
  );
}

// Custom hook to use the app state
export function useAppState() {
  const context = useContext(AppStateContext);
  
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  
  return context;
} 