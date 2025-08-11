
import { hashGoogleId } from './privacy';

// **CLIENT-SIDE: Encrypt signer emails using owner's Google ID**
export async function encryptSignerEmails(
  signerEmails: string[],
  ownerGoogleId: string
): Promise<string[]> {
  console.log('[EMAIL-ENCRYPTION] Encrypting emails for contract owner');
  
  if (!ownerGoogleId) {
    throw new Error('Owner Google ID is required for email encryption');
  }

  if (!signerEmails || signerEmails.length === 0) {
    return [];
  }

  try {
    // Derive encryption key from owner's Google ID
    const encryptionKey = await deriveEncryptionKey(ownerGoogleId);
    
    // Encrypt each email
    const encryptedEmails = await Promise.all(
      signerEmails.map(async (email) => {
        return await encryptEmail(email, encryptionKey);
      })
    );

    console.log('[EMAIL-ENCRYPTION] Successfully encrypted', signerEmails.length, 'emails');
    return encryptedEmails;
    
  } catch (error) {
    console.error('[EMAIL-ENCRYPTION] Encryption failed:', error);
    throw new Error('Failed to encrypt signer emails');
  }
}

// **CLIENT-SIDE: Decrypt signer emails using owner's Google ID**
export async function decryptSignerEmails(
  encryptedEmails: string[],
  ownerGoogleId: string
): Promise<string[]> {
  console.log('[EMAIL-DECRYPTION] Decrypting emails for contract owner');
  
  if (!ownerGoogleId) {
    throw new Error('Owner Google ID is required for email decryption');
  }

  if (!encryptedEmails || encryptedEmails.length === 0) {
    return [];
  }

  try {
    // Derive the same encryption key from owner's Google ID
    const encryptionKey = await deriveEncryptionKey(ownerGoogleId);
    
    // Decrypt each email
    const decryptedEmails = await Promise.all(
      encryptedEmails.map(async (encryptedEmail) => {
        return await decryptEmail(encryptedEmail, encryptionKey);
      })
    );

    console.log('[EMAIL-DECRYPTION] Successfully decrypted', encryptedEmails.length, 'emails');
    return decryptedEmails;
    
  } catch (error) {
    console.error('[EMAIL-DECRYPTION] Decryption failed:', error);
    throw new Error('Failed to decrypt signer emails');
  }
}

// **CLIENT-SIDE: Check if current user can decrypt emails (is the owner)**
export async function canDecryptEmails(
  contractOwnerGoogleIdHash: string,
  currentUserGoogleId: string
): Promise<boolean> {
  if (!contractOwnerGoogleIdHash || !currentUserGoogleId) {
    return false;
  }

  try {
    // Hash current user's Google ID and compare with contract owner's hash
    const currentUserGoogleIdHash = await hashGoogleId(currentUserGoogleId);
    return contractOwnerGoogleIdHash === currentUserGoogleIdHash;
  } catch (error) {
    console.error('[EMAIL-DECRYPTION] Cannot verify owner:', error);
    return false;
  }
}

// **PRIVATE: Derive encryption key from Google ID**
async function deriveEncryptionKey(googleId: string): Promise<CryptoKey> {
  // Hash the Google ID to create a deterministic but secure base
  const hashedGoogleId = await hashGoogleId(googleId);
  
  // Use PBKDF2 to derive a strong encryption key
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hashedGoogleId),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = encoder.encode('epoch_one_email_encryption_salt'); // Fixed salt for deterministic keys
  
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return encryptionKey;
}

// **PRIVATE: Encrypt a single email**
async function encryptEmail(email: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  
  // Generate a random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined));
}

// **PRIVATE: Decrypt a single email**
async function decryptEmail(encryptedEmail: string, key: CryptoKey): Promise<string> {
  try {
    // Convert from base64
    const combined = new Uint8Array(
      atob(encryptedEmail).split('').map(char => char.charCodeAt(0))
    );
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
    
  } catch (error) {
    console.error('[EMAIL-DECRYPTION] Failed to decrypt email:', error);
    throw new Error('Invalid encryption or wrong key');
  }
}

