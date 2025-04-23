'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ThemeProvider } from 'next-themes';
import { ReactNode, useEffect, useState } from 'react';

interface ProviderProps {
  children: ReactNode;
}

export function Provider({ children }: ProviderProps) {
  // Add this to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ChakraProvider>
        {/* Only render children after first client-side render to avoid hydration mismatch */}
        {mounted ? children : null}
      </ChakraProvider>
    </ThemeProvider>
  );
} 