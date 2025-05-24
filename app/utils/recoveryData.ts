/**
 * Utility for handling contract recovery data
 */

export interface RecoveryData {
  blobId: string;
  allowlistId: string;
  documentId: string;
  contractId: string;
  timestamp: string;
}

/**
 * Downloads recovery data as a JSON file
 */
export function downloadRecoveryData(recoveryData: RecoveryData, fileName?: string): void {
  try {
    const recoveryJson = {
      blobId: recoveryData.blobId,
      allowlistId: recoveryData.allowlistId,
      documentId: recoveryData.documentId,
      contractId: recoveryData.contractId,
      timestamp: recoveryData.timestamp,
      note: "This file contains essential data for contract recovery. Store it securely."
    };

    const jsonString = JSON.stringify(recoveryJson, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || `recovery_${recoveryData.contractId}_${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    console.log('[Recovery] Recovery data downloaded successfully');
  } catch (error) {
    console.error('[Recovery] Error downloading recovery data:', error);
    throw new Error('Failed to download recovery data');
  }
}

/**
 * Extracts recovery data from contract metadata
 */
export function extractRecoveryData(contract: any): RecoveryData | null {
  try {
    const metadata = contract.metadata;
    if (!metadata?.walrus) {
      console.warn('[Recovery] No Walrus metadata found in contract');
      return null;
    }

    const blobId = metadata.walrus.storage?.blobId;
    const allowlistId = metadata.walrus.encryption?.allowlistId;
    const documentId = metadata.walrus.encryption?.documentId;

    if (!blobId || !allowlistId || !documentId) {
      console.warn('[Recovery] Missing required recovery data:', { blobId, allowlistId, documentId });
      return null;
    }

    return {
      blobId,
      allowlistId,
      documentId,
      contractId: contract.id,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Recovery] Error extracting recovery data:', error);
    return null;
  }
} 