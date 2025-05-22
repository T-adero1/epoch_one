/*
/// Module: epochone
module epochone::epochone;
*/

// SPDX-License-Identifier: MIT
// ──────────────────────────────────────────────────────────────
//  EPOCH :: Smart Contract Skeleton
//  Chain: Sui  •  Version: 0.1.0
// ──────────────────────────────────────────────────────────────

module epochone::epochone {
    // Standard imports
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::vector;
    use std::option::{Self, Option};
    use std::string;
    // Crypto module is not available in this environment yet, but will be uncommented in production
    use sui::ed25519;
    use sui::zklogin_verified_id::{Self};
    
    // ===== Constants =====
    const PREFIX: vector<u8> = b"signing_a_document_using_EPOCHONE!";
    const EXPECTED_BLOB_LENGTH: u64 = 32;
    const VOUCHER_EXPIRY_MS: u64 = 2592000000; // 30 days in milliseconds
    
    // ===== Error Constants =====
    const ERR_NOT_AUTHORIZED: u64 = 1;
    const ERR_NOT_FOUND: u64 = 3;
    const ERR_BAD_SIG: u64 = 4;
    const ERR_ALREADY_REGISTERED: u64 = 5;
    const ERR_BAD_AUD: u64 = 6;
    const ERR_VOUCHER_OWNER: u64 = 7;
    const ERR_VOUCHER_EMPTY: u64 = 8;
    const ERR_MISSING_COMMIT: u64 = 9;
    const ERR_BAD_HASH_LEN: u64 = 10;
    const ERR_BAD_BLOB_LEN: u64 = 11;
    const ERR_IDENTITY_MISMATCH: u64 = 12;
    const ERR_IDENTITY_NOT_VERIFIED: u64 = 13;
    const ERR_VOUCHER_EXPIRED: u64 = 14;
    
    // ===== Events =====
    public struct ContractCreated has drop, copy {
        id: address,
        creator: address,
        timestamp: u64,
        creator_email_hash: vector<u8>,
        signer_email_hash: vector<u8>
    }
    
    public struct ContractVoided has drop, copy {
        id: address,
        voider: address,
        timestamp: u64
    }
    
    // Custom event for when a voucher is consumed
    public struct VoucherExhausted has drop, copy {
        owner: address,
        timestamp: u64
    }
    
    // ===== Identity =====
    public struct Identity has store {
        owner: address,
        registered_at: u64,
        aud_verified: bool,
        key_claim_value: Option<vector<u8>>,  // Store sub claim from zkLogin
        issuer: Option<vector<u8>>,           // Store issuer information (e.g., "accounts.google.com")
        audience: Option<vector<u8>>          // Store audience (client ID)
    }
    
    // ===== Gas Voucher =====
    public struct GasVoucher has key, store {
        id: UID,
        owner: address,
        uses_left: u64,
        created_at: u64
    }
    
    // ===== Core Objects =====
    public struct Registry has key {
        id: UID,
        admin: address,
        contracts: Table<address, Contract>,
        contract_count: u64,
        voided_count: u64,
        email_identities: Table<vector<u8>, Identity>,
        verified_ids: Table<address, Identity>
    }
    
    public struct Contract has key, store {
        id: UID,
        creator: address,
        walrus_blob_id: Option<vector<u8>>,
        document_hash: vector<u8>,
        creator_sig: Option<vector<u8>>,
        signer_sig: Option<vector<u8>>,
        creator_commitment: Option<vector<u8>>,
        signer_commitment: Option<vector<u8>>,
        creator_email_hash: vector<u8>,  
        signer_email_hash: vector<u8>,    
        created_at: u64,
        is_public: bool,
        voided: bool,
        version: u8
    }

    
    // ===== Admin Capability =====
    public struct AdminCap has key, store {
        id: UID
    }
    
    // ===== Helper Functions =====
    
    /// Verify a signature with the document prefix to prevent replay attacks
    /// @param pub_key: The Ed25519 public key (32 bytes)
    /// @param sig: The Ed25519 signature (64 bytes)
    /// @param hash: The document hash (32 bytes)
    /// @return: True if the signature is valid, false otherwise
    fun verify_prefix_sig(pub_key: &vector<u8>, sig: &vector<u8>, hash: &vector<u8>){
        if (vector::length(pub_key) != 32 || vector::length(sig) != 64) {
            abort 4; // or any error code you want
        };

        let mut message = vector::empty<u8>();
        vector::append(&mut message, PREFIX);
        vector::append(&mut message, *hash);

        ed25519::ed25519_verify(sig, pub_key, &message);
    }

    
    
    
    // ===== Module Initialization =====
    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        
        // Create and share Registry
        let registry = Registry {
            id: object::new(ctx),
            admin,
            contracts: table::new(ctx),
            contract_count: 0,
            voided_count: 0,
            email_identities: table::new(ctx),
            verified_ids: table::new(ctx)
        };
        
        // Create and transfer AdminCap
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };
        
        transfer::share_object(registry);
        transfer::transfer(admin_cap, admin);
    }
    
    // For testing purposes only
    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(ctx)
    }
    
    // ===== Public Functions =====
    
    /// Issue a voucher to a recipient
    public entry fun issue_voucher(
        registry: &Registry,
        recipient: address,
        uses: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Only admin can issue vouchers
        let sender = tx_context::sender(ctx);
        assert!(sender == registry.admin, ERR_NOT_AUTHORIZED);
        
        // Create the voucher
        let voucher = GasVoucher {
            id: object::new(ctx),
            owner: recipient,
            uses_left: uses,
            created_at: clock::timestamp_ms(clock)
        };
        
        // Transfer the voucher to the recipient
        transfer::transfer(voucher, recipient);
    }
    
    /// Register an identity linked to an email hash
    /// @param registry: The registry object
    /// @param email_hash: The hash of the user's email
    /// @param sub_value: The ZkLogin sub (subject) value
    /// @param issuer_value: The issuer (e.g., accounts.google.com)
    /// @param audience_value: The audience (client ID)
    /// @param clock: The clock object
    /// @param ctx: The transaction context
    public entry fun register_identity(
        registry: &mut Registry,
        email_hash: vector<u8>,
        sub_value: vector<u8>,
        issuer_value: vector<u8>,
        audience_value: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let owner = tx_context::sender(ctx);
        
        // Check if the identity is already registered
        assert!(!table::contains(&registry.email_identities, email_hash), ERR_ALREADY_REGISTERED);
        assert!(!table::contains(&registry.verified_ids, owner), ERR_ALREADY_REGISTERED);
        
        // Verify zklogin identity
        let pin_hash = 0;
        let sub_claim = string::utf8(b"sub");
        let sub_value_str = string::utf8(sub_value);
        let issuer_str = string::utf8(issuer_value);
        let audience_str = string::utf8(audience_value);
        let ok = zklogin_verified_id::check_zklogin_id(
            owner,
            &sub_claim,  // key_claim_name
            &sub_value_str,
            &issuer_str,
            &audience_str,
            pin_hash
        );

        
        assert!(ok, ERR_BAD_AUD);
        
        // Create the identity
        let identity = Identity {
            owner,
            registered_at: clock::timestamp_ms(clock),
            aud_verified: true,
            key_claim_value: option::some(sub_value),
            issuer: option::some(issuer_value),
            audience: option::some(audience_value)
        };
        
        // Add the identity to both tables in the registry
        table::add(&mut registry.email_identities, email_hash, identity);
        
        // Create a duplicate of the identity to store by address
        let identity_by_address = Identity {
            owner,
            registered_at: clock::timestamp_ms(clock),
            aud_verified: true,
            key_claim_value: option::some(sub_value),
            issuer: option::some(issuer_value),
            audience: option::some(audience_value)
        };
        
        table::add(&mut registry.verified_ids, owner, identity_by_address);
    }
    
    /// Create a new contract
    /// @param registry: The registry object
    /// @param voucher: The gas voucher
    /// @param walrus_blob_id: The optional Walrus blob ID (32 bytes if present)
    /// @param document_hash: The document hash (32 bytes)
    /// @param creator_pub_key: The creator's public key
    /// @param signer_pub_key: The signer's public key
    /// @param creator_sig: The optional creator's signature
    /// @param signer_sig: The optional signer's signature
    /// @param creator_commitment: The optional creator's commitment
    /// @param signer_commitment: The optional signer's commitment
    /// @param creator_email_hash: The creator's email hash
    /// @param signer_email_hash: The signer's email hash
    /// @param is_public: Whether the contract is public or private
    /// @param clock: The clock object
    /// @param ctx: The transaction context
    public entry fun create_contract(
        registry: &mut Registry,
        voucher: &mut GasVoucher,
        walrus_blob_id: Option<vector<u8>>,
        document_hash: vector<u8>,
        creator_pub_key: vector<u8>,
        signer_pub_key: vector<u8>,
        creator_sig: Option<vector<u8>>,
        signer_sig: Option<vector<u8>>,
        creator_commitment: Option<vector<u8>>,
        signer_commitment: Option<vector<u8>>,
        creator_email_hash: vector<u8>,
        signer_email_hash: vector<u8>,
        is_public: bool,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let creator = tx_context::sender(ctx);
        
        // Verify voucher ownership and usage
        assert!(voucher.owner == creator, ERR_VOUCHER_OWNER);
        assert!(voucher.uses_left > 0, ERR_VOUCHER_EMPTY);
        
        // Check if voucher is expired
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time <= voucher.created_at + VOUCHER_EXPIRY_MS, ERR_VOUCHER_EXPIRED);
        
        // Verify document hash length (should be 32 bytes for a standard hash)
        assert!(vector::length(&document_hash) == 32, ERR_BAD_HASH_LEN);
        
        // Verify Walrus blob ID length if present
        if (option::is_some(&walrus_blob_id)) {
            assert!(vector::length(option::borrow(&walrus_blob_id)) == EXPECTED_BLOB_LENGTH, ERR_BAD_BLOB_LEN);
        };
        
        // Verify identities exist and belong to the correct users
        assert!(table::contains(&registry.email_identities, creator_email_hash), ERR_NOT_FOUND);
        assert!(table::contains(&registry.email_identities, signer_email_hash), ERR_NOT_FOUND);
        
        // Check VerifiedID exists in our registry by address for both creator and signer
        assert!(table::contains(&registry.verified_ids, creator), ERR_IDENTITY_NOT_VERIFIED);
        
        let creator_identity = table::borrow(&registry.email_identities, creator_email_hash);
        let signer_identity = table::borrow(&registry.email_identities, signer_email_hash);
        
        // Verify creator identity matches the sender
        assert!(creator_identity.owner == creator, ERR_IDENTITY_MISMATCH);
        assert!(creator_identity.aud_verified, ERR_IDENTITY_NOT_VERIFIED);
        assert!(signer_identity.aud_verified, ERR_IDENTITY_NOT_VERIFIED);
        
        // Verify based on public/private mode
        if (is_public) {
            // In public mode, we need signatures
            assert!(option::is_some(&creator_sig) && option::is_some(&signer_sig), ERR_BAD_SIG);
            
            // Verify signatures
            let creator_sig_val = option::borrow(&creator_sig);
            let signer_sig_val = option::borrow(&signer_sig);
            
            verify_prefix_sig(&creator_pub_key, creator_sig_val, &document_hash);
            verify_prefix_sig(&signer_pub_key, signer_sig_val, &document_hash);

        } else {
            // In private mode, we need commitments
            assert!(option::is_some(&creator_commitment) && option::is_some(&signer_commitment), ERR_MISSING_COMMIT);
            
            // In a real implementation, we might validate commitments here
            // For now, we just check they're not empty
            assert!(vector::length(option::borrow(&creator_commitment)) > 0, ERR_MISSING_COMMIT);
            assert!(vector::length(option::borrow(&signer_commitment)) > 0, ERR_MISSING_COMMIT);
        };
        
        // Decrement voucher usage count
        voucher.uses_left = voucher.uses_left - 1;
        
        // Emit event if voucher is consumed
        if (voucher.uses_left == 0) {
            // Emit a voucher consumed event instead of trying to delete it here
            event::emit(VoucherExhausted {
                owner: creator,
                timestamp: clock::timestamp_ms(clock)
            });
        };
        
        let timestamp = clock::timestamp_ms(clock);
        
        let contract = Contract {
            id: object::new(ctx),
            creator,
            walrus_blob_id,
            document_hash,
            creator_sig,
            signer_sig,
            creator_commitment,
            signer_commitment,
            creator_email_hash,
            signer_email_hash,
            created_at: timestamp,
            is_public,
            voided: false,
            version: 1u8
        };
        
        let contract_id = object::uid_to_address(&contract.id);
        
        // Store contract in registry
        table::add(&mut registry.contracts, contract_id, contract);
        registry.contract_count = registry.contract_count + 1;
        
        // Emit event
        event::emit(ContractCreated {
            id: contract_id,
            creator,
            timestamp,
            creator_email_hash,
            signer_email_hash
        });
    }
    
    /// Void a contract (only the creator can void a contract)
    public entry fun void_contract(
        registry: &mut Registry,
        contract_id: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Ensure contract exists
        assert!(table::contains(&registry.contracts, contract_id), ERR_NOT_FOUND);
        
        // Get the contract
        let contract = table::borrow_mut(&mut registry.contracts, contract_id);
        
        // Ensure sender is the creator of the contract
        assert!(contract.creator == sender, ERR_NOT_AUTHORIZED);
        
        // Mark the contract as voided
        contract.voided = true;
        
        // Increment voided count in registry
        registry.voided_count = registry.voided_count + 1;
        
        // Emit contract voided event
        event::emit(ContractVoided {
            id: contract_id,
            voider: sender,
            timestamp: clock::timestamp_ms(clock)
        });
    }
    
    /// Admin override to void a contract (for legal/compliance reasons)
    public entry fun admin_void_contract(
        registry: &mut Registry,
        contract_id: address,
        _admin_cap: &AdminCap,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Ensure sender is admin
        assert!(sender == registry.admin, ERR_NOT_AUTHORIZED);
        
        // Ensure contract exists
        assert!(table::contains(&registry.contracts, contract_id), ERR_NOT_FOUND);
        
        // Get and void the contract
        let contract = table::borrow_mut(&mut registry.contracts, contract_id);
        contract.voided = true;
        
        // Increment voided count in registry
        registry.voided_count = registry.voided_count + 1;
        
        // Emit contract voided event
        event::emit(ContractVoided {
            id: contract_id,
            voider: sender,
            timestamp: clock::timestamp_ms(clock)
        });
    }
    
    /// Delete a voucher when it has no uses left or is expired
    public entry fun delete_voucher(voucher: GasVoucher, clock: &Clock, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        
        // Only the owner can delete their voucher
        assert!(voucher.owner == sender, ERR_NOT_AUTHORIZED);
        
        // Allow deletion when uses are depleted or voucher is expired
        let current_time = clock::timestamp_ms(clock);
        let is_expired = current_time > voucher.created_at + VOUCHER_EXPIRY_MS;
        assert!(voucher.uses_left == 0 || is_expired, ERR_VOUCHER_EMPTY);
        
        // Unpack and delete the voucher
        let GasVoucher { id, owner: _, uses_left: _, created_at: _ } = voucher;
        object::delete(id);
    }
    
    // ===== View Functions =====
    
    /// Get contract details
    public fun get_contract_details(registry: &Registry, contract_id: address): (
        address, 
        Option<vector<u8>>, 
        vector<u8>, 
        Option<vector<u8>>, 
        Option<vector<u8>>, 
        Option<vector<u8>>, 
        Option<vector<u8>>, 
        u64, 
        bool,
        bool
    ) {
        assert!(table::contains(&registry.contracts, contract_id), ERR_NOT_FOUND);
        
        let contract = table::borrow(&registry.contracts, contract_id);
        (
            contract.creator,
            contract.walrus_blob_id,
            contract.document_hash,
            contract.creator_sig,
            contract.signer_sig,
            contract.creator_commitment,
            contract.signer_commitment,
            contract.created_at,
            contract.is_public,
            contract.voided
        )
    }
    
    /// Get registry statistics
    public fun get_registry_stats(registry: &Registry): (u64, u64, u64, u64) {
        (
            registry.contract_count,
            registry.voided_count,
            table::length(&registry.email_identities),
            table::length(&registry.verified_ids)
        )
    }
    
    /// Get contract count
    public fun get_contract_count(registry: &Registry): u64 {
        registry.contract_count
    }
    
    /// Check if an identity exists for a given email hash
    public fun has_identity(registry: &Registry, email_hash: vector<u8>): bool {
        table::contains(&registry.email_identities, email_hash)
    }
    
    /// Get identity details
    public fun get_identity(registry: &Registry, email_hash: vector<u8>): (address, u64, bool) {
        assert!(table::contains(&registry.email_identities, email_hash), ERR_NOT_FOUND);
        
        let identity = table::borrow(&registry.email_identities, email_hash);
        (
            identity.owner,
            identity.registered_at,
            identity.aud_verified
        )
    }
    
    /// Get voucher details
    public fun get_voucher_details(voucher: &GasVoucher): (address, u64) {
        (voucher.owner, voucher.uses_left)
    }
    
    /// Get voucher full details
    public fun get_voucher_full_details(voucher: &GasVoucher): (address, u64, u64) {
        (voucher.owner, voucher.uses_left, voucher.created_at)
    }
    
    /// Check if a voucher is expired
    public fun is_voucher_expired(voucher: &GasVoucher, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time > voucher.created_at + VOUCHER_EXPIRY_MS
    }
    
    /// Get verified identity details by address
    public fun get_verified_identity(registry: &Registry, owner_address: address): (
        address, 
        u64, 
        bool, 
        Option<vector<u8>>, 
        Option<vector<u8>>, 
        Option<vector<u8>>
    ) {
        assert!(table::contains(&registry.verified_ids, owner_address), ERR_NOT_FOUND);
        
        let identity = table::borrow(&registry.verified_ids, owner_address);
        (
            identity.owner,
            identity.registered_at,
            identity.aud_verified,
            identity.key_claim_value,
            identity.issuer,
            identity.audience
        )
    }
    
    // ===== Test helpers =====
    #[test_only]
    public fun register_identity_for_testing(
        registry: &mut Registry,
        email_hash: vector<u8>,
        owner: address,
        verified: bool,
        clock: &Clock
    ) {
        let identity = Identity {
            owner,
            registered_at: clock::timestamp_ms(clock),
            aud_verified: verified,
            key_claim_value: option::none(),
            issuer: option::none(),
            audience: option::none()
        };
        
        table::add(&mut registry.email_identities, email_hash, identity);
        
        // Also add to verified_ids if verified is true
        if (verified) {
            let identity_by_address = Identity {
                owner,
                registered_at: clock::timestamp_ms(clock),
                aud_verified: verified,
                key_claim_value: option::none(),
                issuer: option::none(),
                audience: option::none()
            };
            
            table::add(&mut registry.verified_ids, owner, identity_by_address);
        }
    }
    
    #[test_only]
    public fun create_voucher_for_testing(
        recipient: address,
        uses: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): GasVoucher {
        GasVoucher {
            id: object::new(ctx),
            owner: recipient,
            uses_left: uses,
            created_at: clock::timestamp_ms(clock)
        }
    }
    
    #[test_only]
    public fun create_mock_document_hash(): vector<u8> {
        vector[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
        ]
    }
    
    #[test_only]
    public fun create_mock_signature(): vector<u8> {
        vector[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
            33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
            49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64
        ]
    }
    
    #[test_only]
    public fun create_mock_public_key(): vector<u8> {
        vector[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
        ]
    }
    
    #[test_only]
    public fun create_mock_walrus_blob_id(): vector<u8> {
        vector[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
        ]
    }
}


