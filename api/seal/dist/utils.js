"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageSample = usageSample;
// SEAL utilities for document sharing
// Use CommonJS-style require for compatibility with older versions of Sui.js
const { bcs } = require('@mysten/sui.js');
/**
 * Creates the BCS-encoded identity string for SEAL encryption
 * @param contractId The ID of the contract (can be any string identifier)
 * @param signerAddresses Array of signer addresses (can be regular or zkLogin addresses)
 * @returns Uint8Array of BCS-encoded identity
 */
function createSealIdentity(contractId, signerAddresses) {
    // Convert contractId to bytes - if hex, remove the 0x prefix
    const contractIdBytes = contractId.startsWith('0x')
        ? Buffer.from(contractId.slice(2), 'hex')
        : Buffer.from(contractId);
    // Normalize signer addresses - ensure they all have 0x prefix
    const normalizedSigners = signerAddresses.map((addr) => addr.startsWith('0x') ? addr : `0x${addr}`);
    // Create a Buffer to manually serialize our BCS data
    // First we encode the contract_id as a vector<u8>
    const contractIdLen = contractIdBytes.length;
    let serializedData = Buffer.concat([
        // Length of vector as u32 (little endian)
        Buffer.from([contractIdLen, 0, 0, 0]),
        // Contract ID bytes
        contractIdBytes
    ]);
    // Next we encode the addresses as a vector<address>
    // Vector length as u32 (little endian)
    const addressCount = normalizedSigners.length;
    serializedData = Buffer.concat([
        serializedData,
        Buffer.from([addressCount, 0, 0, 0])
    ]);
    // Add each address (32 bytes each)
    for (const addr of normalizedSigners) {
        let addrBytes;
        if (addr.startsWith('0x')) {
            addrBytes = Buffer.from(addr.slice(2).padStart(64, '0'), 'hex');
        }
        else {
            addrBytes = Buffer.from(addr.padStart(64, '0'), 'hex');
        }
        serializedData = Buffer.concat([serializedData, addrBytes]);
    }
    return serializedData;
}
/**
 * Creates a seal identity and returns it as a hex string
 * @param contractId The ID of the contract
 * @param signerAddresses Array of signer addresses
 * @returns Hex string representation of the BCS-encoded identity
 */
function createSealIdentityHex(contractId, signerAddresses) {
    const idBytes = createSealIdentity(contractId, signerAddresses);
    return `0x${Buffer.from(idBytes).toString('hex')}`;
}
module.exports = {
    createSealIdentity,
    createSealIdentityHex
};
/**
 * Example of how to use the SEAL identity with the SEAL client
 */
function usageSample() {
    /*
    // Example usage with SEAL client:
    
    const { encryptedObject, key } = await sealClient.encrypt({
      threshold: 2,
      packageId: Buffer.from(packageId.slice(2), 'hex'),
      id: createSealIdentity(contractId, [signerAddress1, signerAddress2]),
      data: documentBytes,
    });
    */
}
