// app/utils/pdfReEncryption.ts
export async function reEncryptPDF({
  pdfBytes,
  encryptionMetadata
}: {
  pdfBytes: Uint8Array;
  encryptionMetadata: {
    allowlistId: string;
    documentId: string;
    capId: string;
  };
}): Promise<Uint8Array> {
  console.log('[PDF-RE-ENCRYPT] Starting re-encryption process', {
    pdfSize: pdfBytes.length,
    allowlistId: encryptionMetadata.allowlistId?.substring(0, 8) + '...',
    documentId: encryptionMetadata.documentId?.substring(0, 8) + '...',
    capId: encryptionMetadata.capId?.substring(0, 8) + '...'
  });

  try {
    // Initialize SEAL client
    const { SealClient, getAllowlistedKeyServers } = await import('@mysten/seal');
    const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');

    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    const sealClient = new SealClient({
      suiClient: suiClient as any,
      serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({ objectId: id, weight: 1 })),
      verifyKeyServers: true
    });

    const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID!;

    console.log('[PDF-RE-ENCRYPT] SEAL client initialized, encrypting with existing document ID');

    // ✅ KEY: Re-encrypt with SAME document ID to maintain permissions
    const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
      threshold: 1,
      packageId: SEAL_PACKAGE_ID,
      id: encryptionMetadata.documentId, // ✅ Same ID = same permissions
      data: pdfBytes
    });

    console.log('[PDF-RE-ENCRYPT] Re-encryption completed successfully', {
      originalSize: pdfBytes.length,
      encryptedSize: encryptedBytes.length,
      compressionRatio: (encryptedBytes.length / pdfBytes.length).toFixed(2)
    });

    return encryptedBytes;

  } catch (error) {
    console.error('[PDF-RE-ENCRYPT] Re-encryption failed', {
      error: error.message,
      pdfSize: pdfBytes.length,
      encryptionMetadata
    });
    throw new Error(`PDF re-encryption failed: ${error.message}`);
  }
}

export async function reEncryptAndReplacePDF({
  contractId,
  modifiedPdfBytes,
  existingEncryptionMetadata
}: {
  contractId: string;
  modifiedPdfBytes: Uint8Array;
  existingEncryptionMetadata: {
    allowlistId: string;
    documentId: string;
    capId: string;
  };
}) {
  console.log('[PDF-REPLACE] Starting re-encrypt and replace process', {
    contractId,
    pdfSize: modifiedPdfBytes.length
  });

  try {
    // Step 1: Re-encrypt the modified PDF
    const encryptedBytes = await reEncryptPDF({
      pdfBytes: modifiedPdfBytes,
      encryptionMetadata: existingEncryptionMetadata
    });

    console.log('[PDF-REPLACE] PDF re-encrypted, uploading to AWS', {
      contractId,
      encryptedSize: encryptedBytes.length
    });

    // Step 2: Upload to replace existing file
    const formData = new FormData();
    formData.append('file', new Blob([modifiedPdfBytes], { type: 'application/pdf' }));
    formData.append('contractId', contractId);
    formData.append('encryptedBytes', Buffer.from(encryptedBytes).toString('base64'));
    formData.append('allowlistId', existingEncryptionMetadata.allowlistId);
    formData.append('documentId', existingEncryptionMetadata.documentId);
    formData.append('capId', existingEncryptionMetadata.capId);
    formData.append('isEncrypted', 'true');
    formData.append('replaceExisting', 'true');

    const response = await fetch('/api/contracts/upload-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    console.log('[PDF-REPLACE] Re-encrypt and replace completed successfully', {
      contractId,
      newFileKey: result.contract?.s3FileKey,
      success: true
    });

    return result;

  } catch (error) {
    console.error('[PDF-REPLACE] Re-encrypt and replace failed', {
      contractId,
      error: error.message
    });
    throw error;
  }
}