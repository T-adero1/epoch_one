"use strict";
// SEAL utilities for document sharing with DocumentGroup pattern
/**
 * Creates a document ID for SEAL encryption based on the document group ID
 * @param documentGroupId The ID of the document group object
 * @param dbDocumentId Database ID or other unique identifier for this specific document
 * @returns Uint8Array containing the document ID
 */
function createDocumentId(documentGroupId, dbDocumentId) {
    // Remove '0x' prefix if present
    const documentGroupIdHex = documentGroupId.startsWith('0x') ? documentGroupId.slice(2) : documentGroupId;
    // Convert database ID to bytes
    const dbIdBytes = Buffer.from(dbDocumentId);
    // Concatenate document group ID and database ID as nonce
    return new Uint8Array([
        ...Buffer.from(documentGroupIdHex, 'hex'),
        ...dbIdBytes
    ]);
}
/**
 * Get the move call transaction for Seal access control
 * Creates a transaction with the seal_approve move call
 * @param packageId The package ID of your contract
 * @param documentGroupId The document group object ID
 * @param documentId The full document ID (document group ID + nonce)
 */
function getSealApproveTxPayload(packageId, documentGroupId, documentId) {
    return {
        kind: 'moveCall',
        target: `${packageId}::document_sharing::seal_approve`,
        arguments: [
            { kind: 'pure', value: Array.from(documentId) },
            { kind: 'object', objectId: documentGroupId }
        ]
    };
}
/**
 * Creates a transaction payload to create a new document group
 * @param packageId The package ID of your contract
 * @param name Name for the document group
 * @param dbId Database ID to associate with this group
 */
function createDocumentGroupTxPayload(packageId, name, dbId) {
    return {
        kind: 'moveCall',
        target: `${packageId}::document_sharing::create_document_group_entry`,
        arguments: [
            { kind: 'pure', value: name },
            { kind: 'pure', value: dbId }
        ]
    };
}
/**
 * Creates a transaction payload to add a user to a document group
 * @param packageId The package ID of your contract
 * @param documentGroupId The document group object ID
 * @param adminCapId The admin capability object ID
 * @param userAddress The address of the user to add
 */
function addUserToDocumentGroupTxPayload(packageId, documentGroupId, adminCapId, userAddress) {
    return {
        kind: 'moveCall',
        target: `${packageId}::document_sharing::add_user_entry`,
        arguments: [
            { kind: 'object', objectId: documentGroupId },
            { kind: 'object', objectId: adminCapId },
            { kind: 'pure', value: userAddress }
        ]
    };
}
/**
 * Creates a transaction payload to remove a user from a document group
 * @param packageId The package ID of your contract
 * @param documentGroupId The document group object ID
 * @param adminCapId The admin capability object ID
 * @param userAddress The address of the user to remove
 */
function removeUserFromDocumentGroupTxPayload(packageId, documentGroupId, adminCapId, userAddress) {
    return {
        kind: 'moveCall',
        target: `${packageId}::document_sharing::remove_user_entry`,
        arguments: [
            { kind: 'object', objectId: documentGroupId },
            { kind: 'object', objectId: adminCapId },
            { kind: 'pure', value: userAddress }
        ]
    };
}
/**
 * Example usage of the Document Group SEAL implementation
 */
function getUsageGuide() {
    return `
DOCUMENT GROUP SEAL INTEGRATION GUIDE

This implementation allows multiple wallets to access encrypted documents through
a DocumentGroup shared object that manages access control.

1. CREATING A DOCUMENT GROUP
---------------------------
// First create a document group with your database ID for correlation
const txb = new TransactionBlock();
const createGroupPayload = createDocumentGroupTxPayload(packageId, 'Project Documents', dbId);
txb.moveCall(createGroupPayload);

// Execute the transaction and extract the DocumentGroup ID and AdminCap ID from results
// Store these IDs in your database for future operations

2. MANAGING USERS
---------------
// Add users to the document group
const addUserPayload = addUserToDocumentGroupTxPayload(
  packageId, documentGroupId, adminCapId, userAddress
);
txb.moveCall(addUserPayload);

// Remove users from the document group when needed
const removeUserPayload = removeUserFromDocumentGroupTxPayload(
  packageId, documentGroupId, adminCapId, userAddress
);
txb.moveCall(removeUserPayload);

3. ENCRYPTING DOCUMENTS
--------------------
// Create a document ID for encryption
const documentId = createDocumentId(documentGroupId, dbDocumentId);

// Use the SEAL client to encrypt your document
const { encryptedObject, key } = await sealClient.encrypt({
  threshold: 2,
  id: documentId,
  data: documentBytes
});

// Store the encrypted data in your system

4. DECRYPTING DOCUMENTS
--------------------
// For decryption, create the SEAL approval transaction
const approvePayload = getSealApproveTxPayload(
  packageId, documentGroupId, documentId
);

// Build a transaction with this payload and get txBytes
// Only authorized users in the DocumentGroup will be able to decrypt
const txBytes = await buildTransactionBytes(approvePayload);

// Fetch keys and decrypt using the SEAL client
await sealClient.fetchKeys({
  ids: [documentId],
  txBytes,
  sessionKey,
  threshold: 2
});

const decryptedData = await sealClient.decrypt({
  data: encryptedData,
  sessionKey,
  txBytes,
});
`;
}
module.exports = {
    createDocumentId,
    getSealApproveTxPayload,
    createDocumentGroupTxPayload,
    addUserToDocumentGroupTxPayload,
    removeUserFromDocumentGroupTxPayload,
    getUsageGuide
};
