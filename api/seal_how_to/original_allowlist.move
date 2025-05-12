module walrus::allowlist;

use std::string::String;
use sui::dynamic_field as df;
use walrus::utils::is_prefix;

const EInvalidCap: u64 = 0;
const ENoAccess: u64 = 1;
const EDuplicate: u64 = 2;
const MARKER: u64 = 3;

public struct Allowlist has key {
    id: UID,
    name: String,
    list: vector<address>,
}

public struct Cap has key {
    id: UID,
    allowlist_id: ID,
}

public struct DocUsers has store, drop {
    users: vector<address>
}

//////////////////////////////////////////
/////// Simple allowlist with an admin cap

/// Create an allowlist with an admin cap.
/// The associated key-ids are [pkg id]::[allowlist id][nonce] for any nonce (thus
/// many key-ids can be created for the same allowlist).
public fun create_allowlist(name: String, ctx: &mut TxContext): Cap {
    let allowlist = Allowlist {
        id: object::new(ctx),
        list: vector::empty(),
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
    assert!(!allowlist.list.contains(&account), EDuplicate);
    allowlist.list.push_back(account);
}

public fun remove(allowlist: &mut Allowlist, cap: &Cap, account: address) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    allowlist.list = allowlist.list.filter!(|x| x != account); // TODO: more efficient impl?
}

//////////////////////////////////////////////////////////
/// Access control
/// key format: [pkg id]::[allowlist id][random nonce]
/// (Alternative key format: [pkg id]::[creator address][random nonce] - see private_data.move)

public fun namespace(allowlist: &Allowlist): vector<u8> {
    allowlist.id.to_bytes()
}

/// All allowlisted addresses can access all IDs with the prefix of the allowlist
fun approve_internal(caller: address, id: vector<u8>, allowlist: &Allowlist): bool {
    // Check if the id has the right prefix
    let namespace = namespace(allowlist);
    if (!is_prefix(namespace, id)) {
        return false
    };

    // Check if user is in the allowlist
    allowlist.list.contains(&caller)
}

entry fun seal_approve(id: vector<u8>, allowlist: &Allowlist, ctx: &TxContext) {
    assert!(approve_internal(ctx.sender(), id, allowlist), ENoAccess);
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
        list: vector::empty(),
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

/// Add multiple users to an allowlist in a single transaction
entry fun add_users_entry(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    let mut i = 0;
    while (i < users.length()) {
        // Only add if not already in list
        if (!allowlist.list.contains(&users[i])) {
            allowlist.list.push_back(users[i]);
        };
        i = i + 1;
    };
}

/// Add users and publish document in one transaction
entry fun add_users_and_publish_entry(
    allowlist: &mut Allowlist,
    cap: &Cap,
    users: vector<address>,
    blob_id: String
) {
    // First add users
    add_users_entry(allowlist, cap, users);
    
    // Then publish document
    publish(allowlist, cap, blob_id);
    
    // Create a modified key for the users mapping to avoid collision
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    
    // Add user info under a different key to avoid collision
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let old_users = df::remove<String, DocUsers>(&mut allowlist.id, user_key);
        // We need to do something with old_users because it doesn't have drop
        let DocUsers { users: _ } = old_users; // Explicitly drop fields
    };
    df::add(&mut allowlist.id, user_key, DocUsers { users });
}

/// Update document access in one transaction - for existing documents
entry fun update_document_access(
    allowlist: &mut Allowlist,
    cap: &Cap,
    blob_id: String,
    users: vector<address>
) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    
    // Update main allowlist with all users
    add_users_entry(allowlist, cap, users);
    
    let mut user_key = std::string::utf8(b"users_");
    std::string::append(&mut user_key, blob_id);
    // Update document-specific access list
    if (df::exists_with_type<String, DocUsers>(&allowlist.id, user_key)) {
        let old_users = df::remove<String, DocUsers>(&mut allowlist.id, user_key);
        let DocUsers { users: _ } = old_users; // Explicitly drop fields
    };
    
    // Add the new user mapping
    df::add(&mut allowlist.id, user_key, DocUsers { users });
}