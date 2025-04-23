'use client';

import React, { useEffect, useState } from 'react';
import { Box, Flex, Text, CloseButton, Heading } from '@chakra-ui/react';

interface ToastProps {
  id: string;
  title: string;
  description?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({
  id,
  title,
  description,
  status = 'info',
  duration = 3000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);
  
  const statusColors = {
    info: 'blue.500',
    success: 'green.500',
    warning: 'orange.500',
    error: 'red.500'
  };
  
  const bgColor = statusColors[status];
  
  return (
    <Box
      bg={status === 'error' ? 'red.50' : 'white'} 
      borderLeft="4px"
      borderLeftColor={bgColor}
      boxShadow="md"
      borderRadius="md"
      mb={2}
      maxW="sm"
      w="100%"
      p={3}
      role="alert"
    >
      <Flex justifyContent="space-between" alignItems="center">
        <Heading size="sm" color={bgColor}>{title}</Heading>
        <CloseButton onClick={() => onClose(id)} size="sm" />
      </Flex>
      {description && (
        <Text mt={1} fontSize="sm" color="gray.700">
          {description}
        </Text>
      )}
    </Box>
  );
};

export interface ToastOptions {
  title: string;
  description?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  isClosable?: boolean;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Array<ToastProps & { id: string }>>([]);
  
  useEffect(() => {
    // Create a global event listener for toast events
    const handleToast = (event: CustomEvent) => {
      const { title, description, status, duration, isClosable } = event.detail;
      
      const id = `toast-${Date.now()}`;
      
      setToasts(prev => [
        ...prev,
        {
          id,
          title,
          description,
          status,
          duration,
          onClose: removeToast
        }
      ]);
    };
    
    // Create the custom event type
    window.addEventListener('toast' as any, handleToast as any);
    
    return () => {
      window.removeEventListener('toast' as any, handleToast as any);
    };
  }, []);
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  if (toasts.length === 0) {
    return null;
  }
  
  return (
    <Box
      position="fixed"
      top={4}
      right={4}
      zIndex={1000}
      maxW="sm"
      w="100%"
    >
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} />
      ))}
    </Box>
  );
} 