/**
 * Utility functions for handling zkLogin authentication
 */

/**
 * Extracts JWT token from URL
 * This function extracts the JWT token from the current URL's hash fragment or query parameters
 * 
 * @returns string | null - The JWT token if found, null otherwise
 */
export function extractJwtFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // First check hash fragment (for implicit flow)
    const hash = window.location.hash.substring(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const idToken = hashParams.get('id_token');
      if (idToken) {
        return idToken;
      }
    }

    // Then check query parameters (for authorization code flow)
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    if (codeParam) {
      return codeParam;
    }

    // Check for custom parameter
    const jwtParam = urlParams.get('jwt');
    if (jwtParam) {
      return jwtParam;
    }

    return null;
  } catch (error) {
    console.error('Error extracting JWT from URL:', error);
    return null;
  }
} 