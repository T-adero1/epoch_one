import { useCallback } from 'react';
import { ToastOptions } from '@/components/ToastContainer';

/**
 * Toast message types
 */
type ToastStatus = 'info' | 'success' | 'warning' | 'error';

/**
 * Toast configuration options
 */
interface ToastOptions {
  title: string;
  description?: string;
  status?: ToastStatus;
  duration?: number;
  isClosable?: boolean;
  variant?: 'solid' | 'subtle' | 'left-accent' | 'top-accent' | 'destructive';
  position?: 'top' | 'top-right' | 'top-left' | 'bottom' | 'bottom-right' | 'bottom-left';
}

/**
 * Hook to display toast notifications
 * 
 * This hook provides a function to display toast notifications
 * by dispatching a custom 'toast' event that will be captured
 * by the ToastContainer component.
 */
export function useToast() {
  const toast = useCallback((options: ToastOptions) => {
    if (typeof window === 'undefined') {
      console.log(`[TOAST - ${options.status?.toUpperCase() || 'INFO'}] ${options.title}${options.description ? ': ' + options.description : ''}`);
      return 'toast-ssr';
    }
    
    // Create and dispatch a custom event with the toast details
    const event = new CustomEvent('toast', {
      detail: {
        title: options.title,
        description: options.description,
        status: options.status || 'info',
        duration: options.duration || 3000,
        isClosable: options.isClosable !== false // Default to true
      }
    });
    
    window.dispatchEvent(event);
    
    // Return a unique ID for the toast
    return `toast-${Date.now()}`;
  }, []);

  return { toast };
} 