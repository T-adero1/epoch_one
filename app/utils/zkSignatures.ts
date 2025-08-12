import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export interface ZkSignatureData {
  contentHash: string;
  contentSignature: string;
  imageHash: string;
  imageSignature: string;
  timestamp: number;
  userAddress: string;
  ephemeralPublicKey: string;
}

export async function createSHA256Hash(input: string | Uint8Array): Promise<string> {
  if (typeof input === 'string') {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // ✅ FIX: For Uint8Array input, create a proper ArrayBuffer
    const buffer = new ArrayBuffer(input.length);
    const view = new Uint8Array(buffer);
    view.set(input);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export async function signData(data: string, ephemeralKeyPair: Ed25519Keypair): Promise<string> {
  const dataBytes = new TextEncoder().encode(data);
  const signature = await ephemeralKeyPair.signPersonalMessage(dataBytes);
  
  // ✅ FIX: signature.signature is already a string, just return it
  return signature.signature;
}

export function getSignableContractContent(contract: any): string {
  // Extract just the core contract content that the signer is agreeing to
  return JSON.stringify({
    id: contract.id,
    title: contract.title,
    content: contract.content,
    signers: contract.metadata?.signers || []
  });
} 