module jybr::allowlist;

use std::string::String;
use sui::dynamic_field as df;
use jybr::utils::is_prefix;
use jybr::zklogin_verification;
use sui::table::{Self, Table};
use sui::clock::Clock;
use sui::event;
use sui::hash;


const EInvalidCap: u64 = 0;
const ENoAccess: u64 = 1;
const EDuplicate: u64 = 2;
const MARKER: u64 = 3;
const EExpired: u64 = 4;
const ENotAuthorized: u64 = 5;
const EParameterMismatch: u64 = 6;
const EInvalidCode: u64 = 7;           // Add this
const ENoCodeSet: u64 = 8;
const ONE_HOUR_MS: u64 = 60 * 60 * 1000;             // Add this

public struct Allowlist has key {
    id: UID,
    name: String,
    zklogin_wallets: vector<address>,  // Only zkLogin wallets
    ephemeral_wallets: vector<address>, // Only ephemeral wallets
    verification_hash: Option<vector<u8>>,  // Add this field
}

public struct Cap has key {
    id: UID,
    allowlist_id: ID,
}

public struct DocUsers has store, drop {
    users: vector<address>
}

// Ephemeral key data structure
public struct EphemeralKey has store, drop {
    owner: address,           // Original wallet that authorized this key
    expiry: u64,              // Time when this ephemeral key expires
    document_ids: vector<String>  // Document IDs this key can access
}

// Store ephemeral keys in allowlist
public struct EphemeralKeys has store {
    keys: Table<address, EphemeralKey>
}

// Public event structures
public struct EphemeralKeyAuthorized has copy, drop {
    owner: address,
    ephemeral_key: address,
    expiry: u64,
    blob_id: String
}

public struct EphemeralKeyExpired has copy, drop {
    ephemeral_key: address,
    removed_by: address
}

// Add this after your existing event structures (around line 60)
public struct ZkLoginWalletRevoked has copy, drop {
    allowlist_id: ID,
    revoked_wallet: address,
    revoked_by: address,
    reason: String,
    timestamp: u64,
    batch_operation: bool  // true if part of batch revocation
}

/// User successfully added to allowlist
public struct UserAdded has copy, drop {
    allowlist_id: ID,
    user_address: address,
    added_by: address,
    timestamp: u64,
    verification_method: String,  // "admin_add" or "self_register"
}


/// Document successfully published
public struct DocumentPublished has copy, drop {
    allowlist_id: ID,
    document_id: String,
    published_by: address,
    timestamp: u64,
}

/// Document access successfully updated
public struct DocumentAccessUpdated has copy, drop {
    allowlist_id: ID,
    document_id: String,
    updated_by: address,
    user_count: u64,
    timestamp: u64,
    operation_type: String,  // "publish_new" or "update_existing"
}

/// Ephemeral key successfully revoked
public struct EphemeralKeyRevoked has copy, drop {
    owner: address,
    ephemeral_key: address
}


/// Verification hash successfully updated (admin action)
public struct VerificationHashUpdated has copy, drop {
    allowlist_id: ID,
    updated_by: address,
    timestamp: u64,
    action: String,  // "set", "update", or "disabled"
}

/// Allowlist successfully created
public struct AllowlistCreated has copy, drop {
    allowlist_id: ID,
    name: String,
    created_by: address,
    timestamp: u64,
}

/// Cleanup successfully performed
public struct CleanupPerformed has copy, drop {
    allowlist_id: ID,
    triggered_by: address,
    expired_keys_removed: u64,
    timestamp: u64,
    cleanup_type: String,  // "automatic" or "manual"
}




/// Create an allowlist with an admin cap.
/// The associated key-ids are [pkg id]::[allowlist id][nonce] for any nonce (thus
/// many key-ids can be created for the same allowlist).
public fun create_allowlist(name: String, clock: &Clock, ctx: &mut TxContext): Cap {
    let allowlist = Allowlist {
        id: object::new(ctx),
        zklogin_wallets: vector::empty(),
        ephemeral_wallets: vector::empty(),
        name: name,
        verification_hash: option::none(),  // Add this line
    };
    let cap = Cap {
        id: object::new(ctx),
        allowlist_id: object::id(&allowlist),
    };
    
    // ✅ ADD: Emit AllowlistCreated event
    event::emit(AllowlistCreated {
        allowlist_id: object::id(&allowlist),
        name,
        created_by: ctx.sender(),
        timestamp: clock.timestamp_ms(),
    });
    
    transfer::share_object(allowlist);
    cap
}

// convenience function to create a allowlist and send it back to sender (simpler ptb for cli)
entry fun create_allowlist_entry(name: String, clock: &Clock, ctx: &mut TxContext) {
    transfer::transfer(create_allowlist(name, clock, ctx), ctx.sender());
}


//////////////////////////////////////////////////////////
/// Access control
/// key format: [pkg id]::[allowlist id][random nonce]
/// (Alternative key format: [pkg id]::[creator address][random nonce] - see private_data.move)

public fun namespace(allowlist: &Allowlist): vector<u8> {
    allowlist.id.to_bytes()
}

/// Only ephemeral wallets can access all IDs with the prefix of the allowlist
fun approve_internal(caller: address, id: vector<u8>, allowlist: &Allowlist): bool {
    // Check if the id has the right prefix
    let namespace = namespace(allowlist);
    if (!is_prefix(namespace, id)) {
        return false
    };

    // Check if user is in the ephemeral wallets list (not zklogin_wallets)
    allowlist.ephemeral_wallets.contains(&caller)
}

// Modified seal_approve function to check ephemeral key expiry
entry fun seal_approve(id: vector<u8>, allowlist: &Allowlist, clock: &Clock, ctx: &TxContext) {
    let sender = ctx.sender();
    
    // First check if it's a regular allowlisted address
    if (approve_internal(sender, id, allowlist)) {
        // Check if this is an ephemeral key
        let ephem_key = std::string::utf8(b"ephemeral_keys");
        if (df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
            let _ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key);
            
            // If it's in the ephemeral key registry, check expiry
            if (table::contains(&_ephem_keys.keys, sender)) {
                let key_data = table::borrow(&_ephem_keys.keys, sender);
                // Deny access if expired
                assert!(clock.timestamp_ms() <= key_data.expiry, EExpired);
            }
        }
    } else {
        // If not approved, deny access
        abort ENoAccess
    }
}

/// Encapsulate a blob into a Sui object and attach it to the allowlist
public fun publish(allowlist: &mut Allowlist, cap: &Cap, blob_id: String) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    df::add(&mut allowlist.id, blob_id, MARKER);
}

/// Helper function to create document-specific user key
fun create_user_key(blob_id: String): String {
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    user_key
}

/// Helper function to check if a user is an ephemeral key
fun is_user_ephemeral(allowlist: &Allowlist, user: address): bool {
    let ephem_key_str = std::string::utf8(b"ephemeral_keys");
    
    if (df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key_str)) {
        let ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key_str);
        if (table::contains(&ephem_keys.keys, user)) {
            return true
        };
    };
    
    allowlist.ephemeral_wallets.contains(&user)
}

/// Internal code verification function
fun assert_code_internal(allowlist: &Allowlist, code: vector<u8>) {
    assert!(option::is_some(&allowlist.verification_hash), ENoCodeSet);
    
    let code_hash = hash::keccak256(&code);
    let stored_hash = *option::borrow(&allowlist.verification_hash);
    assert!(code_hash == stored_hash, EInvalidCode);
}

/// Add multiple zkLogin users to an allowlist in a single transaction
entry fun add_users_entry(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>,
    address_seeds: vector<u256>,
    issuers: vector<String>,
    clock: &Clock,
    ctx: &TxContext
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Verify parameters match
    assert!(users.length() == address_seeds.length(), EParameterMismatch);
    assert!(users.length() == issuers.length(), EParameterMismatch);
    
    // Run cleanup at the beginning
    clean_expired_keys_internal(allowlist, clock);
    
    let mut i = 0;
    while (i < users.length()) {
        let user = users[i];
        
        // ✅ ADD: Verify this is a valid zkLogin wallet
        let is_valid_zklogin = zklogin_verification::is_zklogin_wallet(
            user,
            address_seeds[i],
            &issuers[i],
            ctx
        );
        
        // ✅ REPLACE: Use helper function
        let is_ephemeral = is_user_ephemeral(allowlist, user);
        
        // Only add to zklogin_wallets if valid and not ephemeral
        if (!allowlist.zklogin_wallets.contains(&user) && !is_ephemeral && is_valid_zklogin) {
            allowlist.zklogin_wallets.push_back(user);
            
            // ✅ ADD: Emit UserAdded event
            event::emit(UserAdded {
                allowlist_id: object::id(allowlist),
                user_address: user,
                added_by: ctx.sender(),
                timestamp: clock.timestamp_ms(),
                verification_method: std::string::utf8(b"admin_add")
            });
        };
        
        i = i + 1;
    };
}

/// Universal internal function for managing documents and users
entry fun manage_documents_and_users_internal(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>,
    address_seeds: vector<u256>,
    issuers: vector<String>,
    blob_ids: vector<String>,
    should_publish: bool,  // Controls whether to publish documents
    clock: &Clock,
    ctx: &TxContext
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Verify parameters match
    assert!(users.length() == address_seeds.length(), EParameterMismatch);
    assert!(users.length() == issuers.length(), EParameterMismatch);
    
    // Respect Move 2024 limits
    assert!(blob_ids.length() <= 1000, 0); // Max dynamic fields per transaction
    assert!(blob_ids.length() > 0, 0);     // Must have at least one document
    
    // First add users with zkLogin verification (happens once for all docs)
    add_users_entry(allowlist, cap, users, address_seeds, issuers, clock, ctx);
    
    // Process each document
    let mut doc_i = 0;
    while (doc_i < blob_ids.length()) {
        let blob_id = &blob_ids[doc_i];
        
        // Conditionally publish document
        if (should_publish) {
            publish(allowlist, cap, *blob_id);
            
            // ✅ ADD: Emit DocumentPublished event
            event::emit(DocumentPublished {
                allowlist_id: object::id(allowlist),
                document_id: *blob_id,
                published_by: ctx.sender(),
                timestamp: clock.timestamp_ms()
            });
        };
        
        // ✅ Use helper function
        let user_key = create_user_key(*blob_id);
        
        // Filter out ephemeral keys from document-specific users
        let mut filtered_users = vector::empty<address>();
        let mut user_i = 0;
        
        while (user_i < users.length()) {
            let user = users[user_i];
            
            // ✅ Use helper function
            if (!is_user_ephemeral(allowlist, user)) {
                filtered_users.push_back(user);
            };
            
            user_i = user_i + 1;
        };
        
        // Update document-specific access list
        if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
            let old_users = df::remove<String, DocUsers>(&mut allowlist.id, user_key);
            let DocUsers { users: _ } = old_users; // Explicitly drop fields
        };
        
        // Add the filtered user mapping
        df::add(&mut allowlist.id, user_key, DocUsers { users: filtered_users });
        
        // ✅ ADD: Emit DocumentAccessUpdated event
        event::emit(DocumentAccessUpdated {
            allowlist_id: object::id(allowlist),
            document_id: *blob_id,
            updated_by: ctx.sender(),
            user_count: filtered_users.length(),
            timestamp: clock.timestamp_ms(),
            operation_type: if (should_publish) { 
                std::string::utf8(b"publish_new") 
            } else { 
                std::string::utf8(b"update_existing") 
            }
        });
        
        doc_i = doc_i + 1;
    };
}

// Authorize an ephemeral key for document access
entry fun authorize_ephemeral_key(
    allowlist: &mut Allowlist,
    ephemeral_key: address,
    blob_ids: vector<String>,    // ← UPGRADED: Multiple documents
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Run cleanup at the beginning
    clean_expired_keys_internal(allowlist, clock);
    
    let owner = ctx.sender();
    
    // Verify owner is a zkLogin wallet (not ephemeral)
    assert!(allowlist.zklogin_wallets.contains(&owner), ENoAccess);
    
    // Respect Move 2024 limits
    assert!(blob_ids.length() <= 1000, 0);
    assert!(blob_ids.length() > 0, 0);
    
    // Process each document - CONSOLIDATED: check access AND add ephemeral key in one loop
    let mut doc_i = 0;
    while (doc_i < blob_ids.length()) {
        let blob_id = &blob_ids[doc_i];
        
        // ✅ REPLACE: Use helper function
        let user_key = create_user_key(*blob_id);
        
        // Check document-specific access AND add ephemeral key in single operation
        if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
            let doc_users = df::borrow_mut<String, DocUsers>(&mut allowlist.id, user_key);
            
            // Check access permission
            assert!(doc_users.users.contains(&owner), ENoAccess);
            
            // Add ephemeral key if not already there
            if (!doc_users.users.contains(&ephemeral_key)) {
                doc_users.users.push_back(ephemeral_key);
            };
        };
        
        doc_i = doc_i + 1;
    };
    
    // Add ephemeral key to ephemeral wallets list if not already there
    if (!allowlist.ephemeral_wallets.contains(&ephemeral_key)) {
        allowlist.ephemeral_wallets.push_back(ephemeral_key);
    };
    
    // Get or create ephemeral keys registry
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    if (!df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
        df::add(&mut allowlist.id, ephem_key, EphemeralKeys {
            keys: table::new<address, EphemeralKey>(ctx)
        });
    };
    
    // Calculate expiry with hardcoded 1 hour
    let current_time = clock.timestamp_ms();
    let expiry = current_time + ONE_HOUR_MS;
    
    // Add or update ephemeral key data
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    
    // Prepare combined document IDs list - fix the warning here
    let document_ids = if (table::contains(&ephem_keys.keys, ephemeral_key)) {
        let existing_key = table::borrow(&ephem_keys.keys, ephemeral_key);
        assert!(existing_key.owner == owner, ENotAuthorized);
        
        let _old_key = table::remove(&mut ephem_keys.keys, ephemeral_key);
        let mut existing_docs = _old_key.document_ids;
        
        // Add new document IDs if not already there
        let mut i = 0;
        while (i < blob_ids.length()) {
            if (!vector::contains(&existing_docs, &blob_ids[i])) {
                vector::push_back(&mut existing_docs, blob_ids[i]);
            };
            i = i + 1;
        };
        
        existing_docs  // Return merged list
    } else {
        blob_ids  // Return new list directly
    };
    
    // Add the ephemeral key data
    table::add(&mut ephem_keys.keys, ephemeral_key, EphemeralKey {
        owner,
        expiry,
        document_ids
    });
    
    // Emit events for each document
    let mut i = 0;
    while (i < blob_ids.length()) {
        event::emit(EphemeralKeyAuthorized {
            owner,
            ephemeral_key,
            expiry,
            blob_id: blob_ids[i]
        });
        i = i + 1;
    };
}

// Function to verify an ephemeral key's validity
// This is a public helper function that can be used by other contracts
public fun verify_ephemeral_key(
    allowlist: &Allowlist,
    ephemeral_key: address,
    blob_ids: vector<String>,    // ← UPGRADED: Check multiple documents
    clock: &Clock
): bool {
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    
    // If no ephemeral keys registry exists, return false
    if (!df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
        return false
    };
    
    let ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key);
    
    // If this key doesn't exist, return false
    if (!table::contains(&ephem_keys.keys, ephemeral_key)) {
        return false
    };
    
    let key_data = table::borrow(&ephem_keys.keys, ephemeral_key);
    
    // Check expiry
    if (clock.timestamp_ms() > key_data.expiry) {
        return false
    };
    
    // Check if ALL document IDs are in the allowed list
    let mut i = 0;
    while (i < blob_ids.length()) {
        if (!vector::contains(&key_data.document_ids, &blob_ids[i])) {
            return false
        };
        i = i + 1;
    };
    
    true
}


// Revoke an ephemeral key
entry fun revoke_ephemeral_key(
    allowlist: &mut Allowlist,
    ephemeral_key: address,
    ctx: &TxContext
) {
    let owner = ctx.sender();
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    
    assert!(df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key), 0);
    
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    assert!(table::contains(&ephem_keys.keys, ephemeral_key), 0);
    
    let key_data = table::borrow(&ephem_keys.keys, ephemeral_key);
    assert!(key_data.owner == owner, ENotAuthorized);
    
    // Remove the key
    let EphemeralKey { owner: _, expiry: _, document_ids } = table::remove(&mut ephem_keys.keys, ephemeral_key);
    
    // Also remove from ephemeral wallets list
    let mut i = 0;
    let mut new_ephemeral_list = vector::empty<address>();
    
    while (i < vector::length(&allowlist.ephemeral_wallets)) {
        let addr = *vector::borrow(&allowlist.ephemeral_wallets, i);
        if (addr != ephemeral_key) {
            vector::push_back(&mut new_ephemeral_list, addr);
        };
        i = i + 1;
    };
    
    allowlist.ephemeral_wallets = new_ephemeral_list;
    
    // Remove from document-specific lists
    let mut doc_i = 0;
    while (doc_i < document_ids.length()) {
        let blob_id = document_ids[doc_i];
        
        // ✅ REPLACE: Use helper function
        let user_key = create_user_key(blob_id);
        
        if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
            let doc_users = df::borrow_mut<String, DocUsers>(&mut allowlist.id, user_key);
            let mut j = 0;
            let mut found = false;
            
            // Find index of ephemeral key in document users
            while (j < doc_users.users.length() && !found) {
                if (doc_users.users[j] == ephemeral_key) {
                    found = true;
                } else {
                    j = j + 1;
                };
            };
            
            // Remove if found
            if (found && j < doc_users.users.length()) {
                vector::remove(&mut doc_users.users, j);
            };
        };
        
        doc_i = doc_i + 1;
    };
    
    // ✅ ADD: Emit EphemeralKeyRevoked event (was removed accidentally)
    event::emit(EphemeralKeyRevoked {
        owner,
        ephemeral_key
    });
   
}

// Internal cleanup function that can be called by other functions
fun clean_expired_keys_internal(
    allowlist: &mut Allowlist,
    clock: &Clock
) {
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    if (!df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
        return
    };
    
    // Get last cleanup timestamp BEFORE mutable borrow
    let last_cleanup_key = std::string::utf8(b"last_cleanup_time");
    let mut last_cleanup = 0u64;
    
    if (df::exists_with_type<String, u64>(&allowlist.id, last_cleanup_key)) {
        last_cleanup = *df::borrow<String, u64>(&allowlist.id, last_cleanup_key);
    };
    
    let current_time = clock.timestamp_ms();
    
    // Only run cleanup if at least 1 hour has passed since last cleanup
    if (current_time < last_cleanup + 3600000) { // 1 hour in milliseconds
        return
    };
    
    // Now safe to mutably borrow
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    
    // Find keys in the allowlist that might be ephemeral keys
    let mut expired_keys = vector::empty<address>();
    let mut i = 0;
    let max_to_check = 5; // Limit checks to avoid excessive gas costs
    let mut checked = 0;
    
    // Find keys in the ephemeral wallets list
    while (i < allowlist.ephemeral_wallets.length() && checked < max_to_check) {
        let potential_key = allowlist.ephemeral_wallets[i];
        
        // Check if it's in the ephemeral keys table
        if (table::contains(&ephem_keys.keys, potential_key)) {
            checked = checked + 1;
            let key_data = table::borrow(&ephem_keys.keys, potential_key);
            
            // If expired, add to list for removal
            if (current_time > key_data.expiry) {
                vector::push_back(&mut expired_keys, potential_key);
            }
        };
        
        i = i + 1;
    };
    
    // Remove the expired keys
    i = 0;
    while (i < expired_keys.length()) {
        let key = expired_keys[i];
        
        // Remove from table
        let EphemeralKey { owner: _, expiry: _, document_ids: _ } = 
            table::remove(&mut ephem_keys.keys, key);
        
        // Replace the filtered vector implementation with manual removal
        let mut j = 0;
        let mut new_ephemeral_list = vector::empty<address>();
        
        while (j < vector::length(&allowlist.ephemeral_wallets)) {
            let addr = *vector::borrow(&allowlist.ephemeral_wallets, j);
            if (addr != key) {
                vector::push_back(&mut new_ephemeral_list, addr);
            };
            j = j + 1;
        };
        
        allowlist.ephemeral_wallets = new_ephemeral_list;
        i = i + 1;
    };
    
    // Must drop the mutable borrow before attempting to update the timestamp
    // Let's create a copy of current_time to update after dropping ephem_keys
    let timestamp_to_set = current_time;
    
    // Now update the last cleanup timestamp - after previous mutable borrow is dropped
    if (df::exists_with_type<String, u64>(&allowlist.id, last_cleanup_key)) {
        *df::borrow_mut<String, u64>(&mut allowlist.id, last_cleanup_key) = timestamp_to_set;
    } else {
        df::add(&mut allowlist.id, last_cleanup_key, timestamp_to_set);
    };

    // ✅ ADD: Emit CleanupPerformed event for automatic cleanup
    event::emit(CleanupPerformed {
        allowlist_id: object::id(allowlist),
        triggered_by: @0x0, // System-triggered
        expired_keys_removed: expired_keys.length(),
        timestamp: current_time,
        cleanup_type: std::string::utf8(b"automatic")
    });
}

// Keep the dedicated cleanup function too for manual cleanup
entry fun clean_expired_keys(
    allowlist: &mut Allowlist,
    clock: &Clock,
    ctx: &TxContext
) {
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    if (!df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
        return
    };
    
    // Now safe to mutably borrow
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    let current_time = clock.timestamp_ms();
    let sender = ctx.sender();
    
    // Find keys in the allowlist that might be ephemeral keys
    let mut expired_keys = vector::empty<address>();
    let mut i = 0;
    
    // Check all entries in the ephemeral wallets list
    while (i < allowlist.ephemeral_wallets.length()) {
        let potential_key = allowlist.ephemeral_wallets[i];
        
        // Check if it's in the ephemeral keys table
        if (table::contains(&ephem_keys.keys, potential_key)) {
            let key_data = table::borrow(&ephem_keys.keys, potential_key);
            
            // If expired, add to list for removal
            if (current_time > key_data.expiry) {
                vector::push_back(&mut expired_keys, potential_key);
            }
        };
        
        i = i + 1;
    };
    
    // Remove the expired keys
    i = 0;
    while (i < expired_keys.length()) {
        let key = expired_keys[i];
        
        // Remove from table
        let EphemeralKey { owner: _, expiry: _, document_ids: _ } = 
            table::remove(&mut ephem_keys.keys, key);
        
        // Replace filter! with manual removal
        let mut j = 0;
        let mut new_ephemeral_list = vector::empty<address>();
        
        while (j < vector::length(&allowlist.ephemeral_wallets)) {
            let addr = *vector::borrow(&allowlist.ephemeral_wallets, j);
            if (addr != key) {
                vector::push_back(&mut new_ephemeral_list, addr);
            };
            j = j + 1;
        };
        
        allowlist.ephemeral_wallets = new_ephemeral_list;
        
        // Emit event for logging
        event::emit(EphemeralKeyExpired {
            ephemeral_key: key,
            removed_by: sender
        });
        
        i = i + 1;
    };
    
    // Store the current time to update after dropping ephem_keys
    let timestamp_to_set = current_time;
    
    // Now update the last cleanup timestamp
    let last_cleanup_key = std::string::utf8(b"last_cleanup_time");
    if (df::exists_with_type<String, u64>(&allowlist.id, last_cleanup_key)) {
        *df::borrow_mut<String, u64>(&mut allowlist.id, last_cleanup_key) = timestamp_to_set;
    } else {
        df::add(&mut allowlist.id, last_cleanup_key, timestamp_to_set);
    };

    // ✅ ADD: Emit CleanupPerformed event
    event::emit(CleanupPerformed {
        allowlist_id: object::id(allowlist),
        triggered_by: ctx.sender(),
        expired_keys_removed: expired_keys.length(),
        timestamp: current_time,
        cleanup_type: std::string::utf8(b"manual")
    });
}

/// Set verification hash for self-registration (admin only)
entry fun set_verification_hash(
    allowlist: &mut Allowlist,
    cap: &Cap,
    hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    let action = if (option::is_some(&allowlist.verification_hash)) {
        std::string::utf8(b"update")
    } else {
        std::string::utf8(b"set")
    };
    
    allowlist.verification_hash = option::some(hash);
    
    // ✅ ONLY emit on successful update
    event::emit(VerificationHashUpdated {
        allowlist_id: object::id(allowlist),
        updated_by: ctx.sender(),
        timestamp: clock.timestamp_ms(),
        action
    });
}

/// Remove verification hash to disable self-registration (admin only)
entry fun disable_self_registration(
    allowlist: &mut Allowlist,
    cap: &Cap,
    clock: &Clock,
    ctx: &TxContext
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    allowlist.verification_hash = option::none();
    
    // ✅ ADD: Emit VerificationHashUpdated event
    event::emit(VerificationHashUpdated {
        allowlist_id: object::id(allowlist),
        updated_by: ctx.sender(),
        timestamp: clock.timestamp_ms(),
        action: std::string::utf8(b"disabled")
    });
}

/// Self-registration function using code verification
entry fun self_register_with_code(
    allowlist: &mut Allowlist,
    code: vector<u8>,
    address_seed: u256,
    issuer: String,
    clock: &Clock,  // Add clock parameter
    ctx: &TxContext
) {
    // Check code using internal function
    assert_code_internal(allowlist, code);
    
    // Check zkLogin
    let user = ctx.sender();
    assert!(zklogin_verification::is_zklogin_wallet(user, address_seed, &issuer, ctx), EInvalidCode);
    
    // Check not duplicate
    assert!(!allowlist.zklogin_wallets.contains(&user), EDuplicate);
    
    // ✅ REPLACE: Use helper function
    assert!(!is_user_ephemeral(allowlist, user), ENotAuthorized);
    
    // Add user
    allowlist.zklogin_wallets.push_back(user);
    
    // ✅ ONLY emit event on SUCCESS
    event::emit(UserAdded {
        allowlist_id: object::id(allowlist),
        user_address: user,
        added_by: user,
        timestamp: clock.timestamp_ms(),
        verification_method: std::string::utf8(b"self_register")
    });
}


/// Universal zkLogin wallet revocation function - handles single and batch operations
entry fun revoke_zklogin_wallets(
    allowlist: &mut Allowlist,
    cap: &Cap,
    wallets_to_revoke: vector<address>,
    reasons: vector<String>,
    clock: &Clock,
    ctx: &TxContext
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    assert!(wallets_to_revoke.length() == reasons.length(), EParameterMismatch);
    
    // Respect Move 2024 limits - max 100 wallets per transaction
    assert!(wallets_to_revoke.length() <= 100, EParameterMismatch);
    assert!(wallets_to_revoke.length() > 0, EParameterMismatch); // Must revoke at least one
    
    let admin = ctx.sender();
    let timestamp = clock.timestamp_ms();
    let is_batch = wallets_to_revoke.length() > 1;

    let mut i = 0;
    while (i < wallets_to_revoke.length()) {
        let wallet = wallets_to_revoke[i];
        let reason = &reasons[i];
        
        // Only revoke if wallet exists in zklogin_wallets
        if (allowlist.zklogin_wallets.contains(&wallet)) {
            // Remove from zklogin_wallets using existing pattern
            let mut j = 0;
            let mut new_list = vector::empty<address>();
            
            while (j < vector::length(&allowlist.zklogin_wallets)) {
                let addr = *vector::borrow(&allowlist.zklogin_wallets, j);
                if (addr != wallet) {
                    vector::push_back(&mut new_list, addr);
                };
                j = j + 1;
            };
            
            allowlist.zklogin_wallets = new_list;
            
            // Emit single event for each revocation
            event::emit(ZkLoginWalletRevoked {
                allowlist_id: object::id(allowlist),
                revoked_wallet: wallet,
                revoked_by: admin,
                reason: *reason,
                timestamp,
                batch_operation: is_batch
            });
        };
        
        i = i + 1;
    };
}