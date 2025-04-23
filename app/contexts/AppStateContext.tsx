'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Define the app state types
interface SessionState {
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;
  lastActivity: number | null;
}

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  errors: {
    sessionError: string | null;
    apiError: string | null;
    validationError: string | null;
  };
}

interface AppState {
  session: SessionState;
  ui: UIState;
}

// Define action types
type AppAction = 
  | { type: 'SET_AUTHENTICATED'; payload: { userId: string; userEmail: string } }
  | { type: 'SET_UNAUTHENTICATED' }
  | { type: 'UPDATE_LAST_ACTIVITY' }
  | { type: 'SET_ERROR'; payload: { errorType: keyof UIState['errors']; message: string | null } }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' };

// Initial state
const initialState: AppState = {
  session: {
    isAuthenticated: false,
    userId: null,
    userEmail: null,
    lastActivity: null,
  },
  ui: {
    theme: 'light',
    sidebarOpen: false,
    errors: {
      sessionError: null,
      apiError: null,
      validationError: null,
    }
  }
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_AUTHENTICATED':
      return {
        ...state,
        session: {
          ...state.session,
          isAuthenticated: true,
          userId: action.payload.userId,
          userEmail: action.payload.userEmail,
          lastActivity: Date.now(),
        },
        ui: {
          ...state.ui,
          errors: {
            ...state.ui.errors,
            sessionError: null,
          }
        }
      };
    case 'SET_UNAUTHENTICATED':
      return {
        ...state,
        session: {
          ...state.session,
          isAuthenticated: false,
          userId: null,
          userEmail: null,
          lastActivity: null,
        }
      };
    case 'UPDATE_LAST_ACTIVITY':
      return {
        ...state,
        session: {
          ...state.session,
          lastActivity: Date.now()
        }
      };
    case 'SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          errors: {
            ...state.ui.errors,
            [action.payload.errorType]: action.payload.message
          }
        }
      };
    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        ui: {
          ...state.ui,
          sidebarOpen: !state.ui.sidebarOpen
        }
      };
    case 'SET_THEME':
      return {
        ...state,
        ui: {
          ...state.ui,
          theme: action.payload
        }
      };
    default:
      return state;
  }
}

// Context type
interface AppStateContextType {
  state: AppState;
  login: (userId: string, userEmail: string) => void;
  logout: () => void;
  updateActivity: () => void;
  setError: (errorType: keyof UIState['errors'], message: string | null) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

// Create context
const AppStateContext = createContext<AppStateContextType>({
  state: initialState,
  login: () => {},
  logout: () => {},
  updateActivity: () => {},
  setError: () => {},
  toggleSidebar: () => {},
  setTheme: () => {},
});

// Hook for using the context
export const useAppState = () => useContext(AppStateContext);

// Provider component
export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const login = useCallback((userId: string, userEmail: string) => {
    dispatch({ type: 'SET_AUTHENTICATED', payload: { userId, userEmail } });
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: 'SET_UNAUTHENTICATED' });
  }, []);

  const updateActivity = useCallback(() => {
    dispatch({ type: 'UPDATE_LAST_ACTIVITY' });
  }, []);

  const setError = useCallback((errorType: keyof UIState['errors'], message: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: { errorType, message } });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme });
  }, []);

  return (
    <AppStateContext.Provider 
      value={{ 
        state, 
        login, 
        logout, 
        updateActivity, 
        setError, 
        toggleSidebar, 
        setTheme 
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}; 