/**
 * Generate a hashed Google ID for privacy-preserving user identification
 * Works in browser using Web Crypto API
 * @param googleId - The Google OAuth sub (subject) identifier
 * @returns Hashed Google ID string
 */
export async function hashGoogleId(googleId: string): Promise<string> {
    // Use Web Crypto API (available in browsers)
    const encoder = new TextEncoder();
    const data = encoder.encode(googleId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }
  
