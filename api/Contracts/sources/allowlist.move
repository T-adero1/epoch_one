module jybr::allowlist;

use std::string::String;
use sui::dynamic_field as df;
use jybr::utils::is_prefix;
use jybr::zklogin_verification;
use sui::table::{Self, Table};
use sui::clock::Clock;
use sui::event;


const EInvalidCap: u64 = 0;
const ENoAccess: u64 = 1;
const EDuplicate: u64 = 2;
const MARKER: u64 = 3;
const EExpired: u64 = 4;
const ENotAuthorized: u64 = 5;
const EParameterMismatch: u64 = 6;


public struct Allowlist has key {
    id: UID,
    name: String,
    zklogin_wallets: vector<address>,  // Only zkLogin wallets
    ephemeral_wallets: vector<address>, // Only ephemeral wallets
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

public struct EphemeralKeyExtended has copy, drop {
    owner: address,
    ephemeral_key: address,
    expiry: u64
}

public struct EphemeralKeyRevoked has copy, drop {
    owner: address,
    ephemeral_key: address
}

public struct EphemeralKeyExpired has copy, drop {
    ephemeral_key: address,
    removed_by: address
}

//////////////////////////////////////////
/////// Simple allowlist with an admin cap

/// Create an allowlist with an admin cap.
/// The associated key-ids are [pkg id]::[allowlist id][nonce] for any nonce (thus
/// many key-ids can be created for the same allowlist).
public fun create_allowlist(name: String, ctx: &mut TxContext): Cap {
    let allowlist = Allowlist {
        id: object::new(ctx),
        zklogin_wallets: vector::empty(),
        ephemeral_wallets: vector::empty(),
        name: name,
    };
    let cap = Cap {
        id: object::new(ctx),
        allowlist_id: object::id(&allowlist),
    };
    transfer::share_object(allowlist);
    cap
}

// convenience function to create a allowlist and send it back to sender (simpler ptb for cli)
entry fun create_allowlist_entry(name: String, ctx: &mut TxContext) {
    transfer::transfer(create_allowlist(name, ctx), ctx.sender());
}

public fun add(allowlist: &mut Allowlist, cap: &Cap, account: address) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    assert!(!allowlist.zklogin_wallets.contains(&account), EDuplicate);
    allowlist.zklogin_wallets.push_back(account);
}

public fun remove(allowlist: &mut Allowlist, cap: &Cap, account: address) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Manual implementation to replace filter!
    let mut i = 0;
    let mut new_list = vector::empty<address>();
    
    while (i < vector::length(&allowlist.zklogin_wallets)) {
        let addr = *vector::borrow(&allowlist.zklogin_wallets, i);
        if (addr != account) {
            vector::push_back(&mut new_list, addr);
        };
        i = i + 1;
    };
    
    allowlist.zklogin_wallets = new_list;
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

#[test_only]
public fun new_allowlist_for_testing(ctx: &mut TxContext): Allowlist {
    use std::string::utf8;

    Allowlist {
        id: object::new(ctx),
        name: utf8(b"test"),
        zklogin_wallets: vector::empty(),
        ephemeral_wallets: vector::empty(),
    }
}

#[test_only]
public fun new_cap_for_testing(ctx: &mut TxContext, allowlist: &Allowlist): Cap {
    Cap {
        id: object::new(ctx),
        allowlist_id: object::id(allowlist),
    }
}

#[test_only]
public fun destroy_for_testing(allowlist: Allowlist, cap: Cap) {
    let Allowlist { id, .. } = allowlist;
    object::delete(id);
    let Cap { id, .. } = cap;
    object::delete(id);
}

/// Add multiple zkLogin users to an allowlist in a single transaction
entry fun add_users_entry(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>,
    address_seeds: vector<u256>,    // Add this parameter
    issuers: vector<String>,        // Add this parameter
    clock: &Clock
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Verify parameters match
    assert!(users.length() == address_seeds.length(), EParameterMismatch);
    assert!(users.length() == issuers.length(), EParameterMismatch);
    
    // Run cleanup at the beginning
    clean_expired_keys_internal(allowlist, clock);
    
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    let ephem_keys_exist = df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key);
    
    let mut i = 0;
    while (i < users.length()) {
        let user = users[i];
        
        // ✅ ADD: Verify this is a valid zkLogin wallet
        let is_valid_zklogin = zklogin_verification::is_zklogin_wallet(
            user,
            address_seeds[i],
            &issuers[i]
        );
        
        // Check if this address is an ephemeral key
        let mut is_ephemeral = false;
        if (ephem_keys_exist) {
            let ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key);
            is_ephemeral = table::contains(&ephem_keys.keys, user);
        };
        
        // Also check if it's in the ephemeral_wallets list
        if (!is_ephemeral) {
            is_ephemeral = allowlist.ephemeral_wallets.contains(&user);
        };
        
        // Only add to zklogin_wallets if:
        // 1. Not already in zklogin_wallets list
        // 2. Not an ephemeral key (in either registry or ephemeral_wallets list)
        // 3. ✅ ADD: Is a valid zkLogin wallet
        if (!allowlist.zklogin_wallets.contains(&user) && !is_ephemeral && is_valid_zklogin) {
            allowlist.zklogin_wallets.push_back(user);
        };
        
        i = i + 1;
    };
}

/// Add users and publish document in one transaction
entry fun add_users_and_publish_entry(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>,
    address_seeds: vector<u256>,    // Add this
    issuers: vector<String>,        // Add this
    blob_id: String,
    clock: &Clock
) {
    // First add users with zkLogin verification
    add_users_entry(allowlist, cap, users, address_seeds, issuers, clock);
    
    // Then publish document
    publish(allowlist, cap, blob_id);
    
    // Create a modified key for the users mapping to avoid collision
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    
    // Filter out ephemeral keys from document-specific users
    let mut filtered_users = vector::empty<address>();
    let ephem_key_str = std::string::utf8(b"ephemeral_keys");
    let ephem_keys_exist = df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key_str);
    
    let mut i = 0;
    while (i < users.length()) {
        let user = users[i];
        let mut is_ephemeral = false;
        
        // Check if user is an ephemeral key
        if (ephem_keys_exist) {
            let ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key_str);
            is_ephemeral = table::contains(&ephem_keys.keys, user);
        };
        
        if (!is_ephemeral) {
            is_ephemeral = allowlist.ephemeral_wallets.contains(&user);
        };
        
        // Only add non-ephemeral users to document-specific list
        if (!is_ephemeral) {
            filtered_users.push_back(user);
        };
        
        i = i + 1;
    };
    
    // Add filtered user info under document key
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let old_users = df::remove<String, DocUsers>(&mut allowlist.id, user_key);
        // We need to do something with old_users because it doesn't have drop
        let DocUsers { users: _ } = old_users; // Explicitly drop fields
    };
    df::add(&mut allowlist.id, user_key, DocUsers { users: filtered_users });
}

/// Update document access in one transaction - for existing documents
entry fun update_document_access(
    allowlist: &mut Allowlist,
    cap: &Cap,
    blob_id: String,
    users: vector<address>,
    address_seeds: vector<u256>,  // Add these parameters
    issuers: vector<String>,      // Add these parameters
    clock: &Clock
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Run cleanup at the beginning (will happen in add_users_entry)
    
    // Update main allowlist with all users - which now includes cleanup
    add_users_entry(allowlist, cap, users, address_seeds, issuers, clock);
    
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    
    // Filter out ephemeral keys from document-specific users
    let mut filtered_users = vector::empty<address>();
    let ephem_key_str = std::string::utf8(b"ephemeral_keys");
    let ephem_keys_exist = df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key_str);
    
    let mut i = 0;
    while (i < users.length()) {
        let user = users[i];
        let mut is_ephemeral = false;
        
        // Check if user is an ephemeral key
        if (ephem_keys_exist) {
            let ephem_keys = df::borrow<String, EphemeralKeys>(&allowlist.id, ephem_key_str);
            is_ephemeral = table::contains(&ephem_keys.keys, user);
        };
        
        if (!is_ephemeral) {
            is_ephemeral = allowlist.ephemeral_wallets.contains(&user);
        };
        
        // Only add non-ephemeral users to document-specific list
        if (!is_ephemeral) {
            filtered_users.push_back(user);
        };
        
        i = i + 1;
    };
    
    // Update document-specific access list
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let old_users = df::remove<String, DocUsers>(&mut allowlist.id, user_key);
        let DocUsers { users: _ } = old_users; // Explicitly drop fields
    };
    
    // Add the filtered user mapping
    df::add(&mut allowlist.id, user_key, DocUsers { users: filtered_users });
}

// Authorize an ephemeral key for document access
entry fun authorize_ephemeral_key(
    allowlist: &mut Allowlist,
    ephemeral_key: address,
    blob_id: String,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Run cleanup at the beginning
    clean_expired_keys_internal(allowlist, clock);
    
    let owner = ctx.sender();
    
    // Verify owner is a zkLogin wallet (not ephemeral)
    assert!(allowlist.zklogin_wallets.contains(&owner), ENoAccess);
    
    // Check document-specific access if it exists
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let doc_users = df::borrow<String, DocUsers>(&allowlist.id, user_key);
        assert!(doc_users.users.contains(&owner), ENoAccess);
    };
    
    // Add ephemeral key to ephemeral wallets list if not already there
    if (!allowlist.ephemeral_wallets.contains(&ephemeral_key)) {
        allowlist.ephemeral_wallets.push_back(ephemeral_key);
    };
    
    // Add ephemeral key to document-specific users if needed
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let doc_users = df::borrow_mut<String, DocUsers>(&mut allowlist.id, user_key);
        if (!doc_users.users.contains(&ephemeral_key)) {
            doc_users.users.push_back(ephemeral_key);
        };
    };
    
    // Get the ephemeral keys registry or create it
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    if (!df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key)) {
        df::add(&mut allowlist.id, ephem_key, EphemeralKeys {
            keys: table::new<address, EphemeralKey>(ctx)
        });
    };
    
    // Get current time and calculate expiry
    let current_time = clock.timestamp_ms();
    let expiry = current_time + expiry_ms;
    
    // Add or update ephemeral key data
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    
    // Prepare document IDs list
    let mut document_ids = vector::empty<String>();
    vector::push_back(&mut document_ids, blob_id);
    
    // If key exists, update it
    if (table::contains(&ephem_keys.keys, ephemeral_key)) {
        let existing_key = table::borrow(&ephem_keys.keys, ephemeral_key);
        
        // Only allow owner to update their own ephemeral keys
        assert!(existing_key.owner == owner, ENotAuthorized);
        
        // Remove existing key data
        let _old_key = table::remove(&mut ephem_keys.keys, ephemeral_key);
        
        // Keep existing document IDs and add new one if not already there
        document_ids = _old_key.document_ids;
        if (!vector::contains(&document_ids, &blob_id)) {
            vector::push_back(&mut document_ids, blob_id);
        };
    };
    
    // Add the ephemeral key data
    table::add(&mut ephem_keys.keys, ephemeral_key, EphemeralKey {
        owner,
        expiry,
        document_ids
    });
    
    // Emit event for confirmation
    event::emit(EphemeralKeyAuthorized {
        owner,
        ephemeral_key,
        expiry,
        blob_id
    });
}

// Function to verify an ephemeral key's validity
// This is a public helper function that can be used by other contracts
public fun verify_ephemeral_key(
    allowlist: &Allowlist,
    ephemeral_key: address,
    blob_id: String,
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
    
    // Check if document ID is in the allowed list
    vector::contains(&key_data.document_ids, &blob_id)
}

// Let the ephemeral key owner extend the expiry
entry fun extend_ephemeral_key(
    allowlist: &mut Allowlist,
    ephemeral_key: address,
    new_expiry_ms: u64,
    clock: &Clock,
    ctx: &TxContext
) {
    let owner = ctx.sender();
    let ephem_key = std::string::utf8(b"ephemeral_keys");
    
    assert!(df::exists_with_type<String, EphemeralKeys>(&allowlist.id, ephem_key), 0);
    
    let ephem_keys = df::borrow_mut<String, EphemeralKeys>(&mut allowlist.id, ephem_key);
    assert!(table::contains(&ephem_keys.keys, ephemeral_key), 0);
    
    let key_data = table::borrow(&ephem_keys.keys, ephemeral_key);
    assert!(key_data.owner == owner, ENotAuthorized);
    
    // Calculate new expiry time
    let current_time = clock.timestamp_ms();
    let new_expiry = current_time + new_expiry_ms;
    
    // Remove and re-add with updated expiry
    let old_key = table::remove(&mut ephem_keys.keys, ephemeral_key);
    
    table::add(&mut ephem_keys.keys, ephemeral_key, EphemeralKey {
        owner: old_key.owner,
        expiry: new_expiry,
        document_ids: old_key.document_ids
    });
    
    // Emit event
    event::emit(EphemeralKeyExtended {
        owner,
        ephemeral_key,
        expiry: new_expiry
    });
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
        let mut user_key = std::string::utf8(b"users_");
        std::string::append(&mut user_key, blob_id);
        
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
    
    // Emit event
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
}
