/**
 * Logger utility for the application
 * Provides consistent logging with timestamps, scope identification,
 * and configurable log levels
 */

// Define log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4 // Used to disable logging
}

// Configuration for the logger
interface LoggerConfig {
  level: LogLevel;
  showTimestamp: boolean;
  showLevel: boolean;
  enabled: boolean;
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  showTimestamp: true,
  showLevel: true,
  enabled: true
};

// Store the current configuration
let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };

// Environment-based configuration
if (typeof window !== 'undefined') {
  const envLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL;
  if (envLogLevel) {
    switch (envLogLevel.toUpperCase()) {
      case 'DEBUG': globalConfig.level = LogLevel.DEBUG; break;
      case 'INFO': globalConfig.level = LogLevel.INFO; break;
      case 'WARN': globalConfig.level = LogLevel.WARN; break;
      case 'ERROR': globalConfig.level = LogLevel.ERROR; break;
      case 'NONE': globalConfig.level = LogLevel.NONE; break;
    }
  }
}

/**
 * Configure the global logger settings
 * @param config - Partial logger configuration to merge with current settings
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Format the current timestamp
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get the level prefix for log messages
 */
function getLevelPrefix(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG: return 'DEBUG';
    case LogLevel.INFO: return 'INFO';
    case LogLevel.WARN: return 'WARN';
    case LogLevel.ERROR: return 'ERROR';
    default: return '';
  }
}

/**
 * Format a log message with timestamp, level, and scope
 */
function formatLogMessage(level: LogLevel, scope: string, message: string): string {
  const parts: string[] = [];
  
  if (globalConfig.showTimestamp) {
    parts.push(`[${getTimestamp()}]`);
  }
  
  if (globalConfig.showLevel) {
    parts.push(`[${getLevelPrefix(level)}]`);
  }
  
  if (scope) {
    parts.push(`[${scope}]`);
  }
  
  parts.push(message);
  return parts.join(' ');
}

/**
 * Core logging function
 */
function logMessage(level: LogLevel, scope: string, message: string, data?: any): void {
  // Skip if logging is disabled or below the configured level
  if (!globalConfig.enabled || level < globalConfig.level) {
    return;
  }
  
  const formattedMessage = formatLogMessage(level, scope, message);
  
  switch (level) {
    case LogLevel.DEBUG:
      if (data) console.debug(formattedMessage, data);
      else console.debug(formattedMessage);
      break;
    case LogLevel.INFO:
      if (data) console.log(formattedMessage, data);
      else console.log(formattedMessage);
      break;
    case LogLevel.WARN:
      if (data) console.warn(formattedMessage, data);
      else console.warn(formattedMessage);
      break;
    case LogLevel.ERROR:
      if (data) console.error(formattedMessage, data);
      else console.error(formattedMessage);
      break;
  }
}

/**
 * Create a logger instance for a specific scope
 */
export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: any) => logMessage(LogLevel.DEBUG, scope, message, data),
    info: (message: string, data?: any) => logMessage(LogLevel.INFO, scope, message, data),
    warn: (message: string, data?: any) => logMessage(LogLevel.WARN, scope, message, data),
    error: (message: string, data?: any) => logMessage(LogLevel.ERROR, scope, message, data),
    
    // Allow local configuration overrides
    withConfig: (config: Partial<LoggerConfig>) => {
      const mergedConfig = { ...globalConfig, ...config };
      const localLogger = (level: LogLevel, message: string, data?: any) => {
        if (!mergedConfig.enabled || level < mergedConfig.level) {
          return;
        }
        
        let formattedMessage = message;
        const parts: string[] = [];
        
        if (mergedConfig.showTimestamp) {
          parts.push(`[${getTimestamp()}]`);
        }
        
        if (mergedConfig.showLevel) {
          parts.push(`[${getLevelPrefix(level)}]`);
        }
        
        parts.push(`[${scope}]`);
        parts.push(message);
        formattedMessage = parts.join(' ');
        
        switch (level) {
          case LogLevel.DEBUG: 
            if (data) console.debug(formattedMessage, data);
            else console.debug(formattedMessage);
            break;
          case LogLevel.INFO:
            if (data) console.log(formattedMessage, data);
            else console.log(formattedMessage);
            break;
          case LogLevel.WARN:
            if (data) console.warn(formattedMessage, data);
            else console.warn(formattedMessage);
            break;
          case LogLevel.ERROR:
            if (data) console.error(formattedMessage, data);
            else console.error(formattedMessage);
            break;
        }
      };
      
      return {
        debug: (message: string, data?: any) => localLogger(LogLevel.DEBUG, message, data),
        info: (message: string, data?: any) => localLogger(LogLevel.INFO, message, data),
        warn: (message: string, data?: any) => localLogger(LogLevel.WARN, message, data),
        error: (message: string, data?: any) => localLogger(LogLevel.ERROR, message, data)
      };
    }
  };
}

// Default global logger with no scope
export const logger = createLogger('App'); 