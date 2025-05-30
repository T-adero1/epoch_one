type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LogMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

interface LogFunction {
  (message: string, meta?: LogMetadata): void;
}

interface Logger {
  info: LogFunction;
  error: LogFunction;
  warn: LogFunction;
  debug: LogFunction;
}

const createLogger = (): Logger => {
  const formatLog = (level: LogLevel, message: string, meta?: LogMetadata) => {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
    };
  };

  return {
    info: (message: string, meta?: LogMetadata) => {
      console.log(JSON.stringify(formatLog('info', message, meta)));
    },
    error: (message: string, meta?: LogMetadata) => {
      console.error(JSON.stringify(formatLog('error', message, meta)));
    },
    warn: (message: string, meta?: LogMetadata) => {
      console.warn(JSON.stringify(formatLog('warn', message, meta)));
    },
    debug: (message: string, meta?: LogMetadata) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(JSON.stringify(formatLog('debug', message, meta)));
      }
    },
  };
};

export const log = createLogger();