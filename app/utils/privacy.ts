/**
 * Generate a hashed Google ID for privacy-preserving user identification
 * Works in browser using Web Crypto API
 * @param googleId - The Google OAuth sub (subject) identifier (raw or already hashed)
 * @returns Hashed Google ID string (idempotent - won't double-hash)
 */
export async function hashGoogleId(googleId: string): Promise<string> {
  // Check if the input is already a SHA-256 hash
  if (isAlreadyHashed(googleId)) {
      console.log('[PRIVACY] Google ID is already hashed, returning as-is');
      return googleId;
  }
  
  console.log('[PRIVACY] Hashing raw Google ID...');
  
  // Use Web Crypto API (available in browsers)
  const encoder = new TextEncoder();
  const data = encoder.encode(googleId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.log('[PRIVACY] Google ID hashed successfully');
  return hashHex;
}

/**
* Check if a string appears to be an already-hashed Google ID
* SHA-256 hash characteristics:
* - Exactly 64 characters long
* - Only contains hexadecimal characters (0-9, a-f)
* @param value - The value to check
* @returns true if it looks like a hash, false otherwise
*/
function isAlreadyHashed(value: string): boolean {
  // SHA-256 hash is exactly 64 hex characters
  if (value.length !== 64) {
      return false;
  }
  
  // Check if it only contains hex characters (0-9, a-f, A-F)
  const hexPattern = /^[0-9a-fA-F]{64}$/;
  const isHex = hexPattern.test(value);
  
  if (isHex) {
      console.log('[PRIVACY] Detected already-hashed Google ID:', value.substring(0, 16) + '...');
  }
  
  return isHex;
}

/**
* Check if current user can decrypt emails (is owner)
* @param ownerGoogleIdHash - The contract owner's hashed Google ID  
* @param currentUserGoogleId - Current user's Google ID (raw or hashed)
* @returns true if user can decrypt, false otherwise
*/
export async function canDecryptEmails(ownerGoogleIdHash: string, currentUserGoogleId: string): Promise<boolean> {
  // Hash the current user's Google ID for comparison
  const currentUserHash = await hashGoogleId(currentUserGoogleId);
  
  // Compare hashed values
  const canDecrypt = ownerGoogleIdHash === currentUserHash;
  
  console.log('[PRIVACY] Decrypt permission check:', {
      ownerHash: ownerGoogleIdHash.substring(0, 16) + '...',
      currentUserHash: currentUserHash.substring(0, 16) + '...',
      canDecrypt
  });
  
  return canDecrypt;
}