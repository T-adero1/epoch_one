module epoch_one_document_sharing::document_sharing {
    use sui::tx_context::{Self, TxContext};
    use sui::object::{Self, UID, ID};
    use std::vector;
    use std::string::String;
    use sui::transfer;
    use sui::dynamic_field as df;

    // Error codes
    const ENotAuthorized: u64 = 1;
    const EInvalidCap: u64 = 2;
    const EDuplicate: u64 = 3;
    const MARKER: u64 = 4;

    struct DocumentGroup has key {
        id: UID,
        name: String,
        db_id: String,  // Store database CUID for correlation
        authorized_users: vector<address>,
    }

    struct AdminCap has key {
        id: UID,
        document_group_id: ID,
    }

    // Create a document group with an admin capability
    public fun create_document_group(name: String, db_id: String, ctx: &mut TxContext): AdminCap {
        let document_group = DocumentGroup {
            id: object::new(ctx),
            name,
            db_id,
            authorized_users: vector::empty(),
        };
        
        let cap = AdminCap {
            id: object::new(ctx),
            document_group_id: object::id(&document_group),
        };
        
        transfer::share_object(document_group);
        cap
    }

    // Convenience entry function to create a document group
    entry fun create_document_group_entry(name: String, db_id: String, ctx: &mut TxContext) {
        transfer::transfer(create_document_group(name, db_id, ctx), tx_context::sender(ctx));
    }

    // Add a user to the document group
    public fun add_user(document_group: &mut DocumentGroup, cap: &AdminCap, user: address) {
        assert!(cap.document_group_id == object::id(document_group), EInvalidCap);
        assert!(!vector::contains(&document_group.authorized_users, &user), EDuplicate);
        vector::push_back(&mut document_group.authorized_users, user);
    }

    // Add a user to the document group (entry function)
    entry fun add_user_entry(document_group: &mut DocumentGroup, cap: &AdminCap, user: address) {
        add_user(document_group, cap, user);
    }

    // Remove a user from the document group
    public fun remove_user(document_group: &mut DocumentGroup, cap: &AdminCap, user: address) {
        assert!(cap.document_group_id == object::id(document_group), EInvalidCap);
        let (contains, index) = vector::index_of(&document_group.authorized_users, &user);
        if (contains) {
            vector::remove(&mut document_group.authorized_users, index);
        }
    }

    // Remove a user from the document group (entry function)
    entry fun remove_user_entry(document_group: &mut DocumentGroup, cap: &AdminCap, user: address) {
        remove_user(document_group, cap, user);
    }

    // Get the database ID of a document group
    public fun get_db_id(document_group: &DocumentGroup): String {
        document_group.db_id
    }

    // Get the namespace for document IDs
    public fun namespace(document_group: &DocumentGroup): vector<u8> {
        object::id_to_bytes(&object::id(document_group))
    }

    // Check if the provided ID has the right prefix and the user is authorized
    fun is_user_authorized(id: vector<u8>, document_group: &DocumentGroup, user: address): bool {
        // Check if ID has the right prefix
        let namespace = namespace(document_group);
        let id_len = vector::length(&id);
        let namespace_len = vector::length(&namespace);
        
        if (id_len < namespace_len) {
            return false
        };
        
        let prefix_match = true;
        let i = 0;
        while (i < namespace_len) {
            if (*vector::borrow(&id, i) != *vector::borrow(&namespace, i)) {
                prefix_match = false;
                break
            };
            i = i + 1;
        };
        
        if (!prefix_match) {
            return false
        };
        
        // Check if user is authorized
        vector::contains(&document_group.authorized_users, &user)
    }

    // Seal approve function for document access
    public entry fun seal_approve(id: vector<u8>, document_group: &DocumentGroup, ctx: &mut TxContext) {
        assert!(is_user_authorized(id, document_group, tx_context::sender(ctx)), ENotAuthorized);
        // If we get here, the sender is authorized to decrypt
    }

    // Publish a document to the document group
    public fun publish_document(document_group: &mut DocumentGroup, cap: &AdminCap, document_id: String) {
        assert!(cap.document_group_id == object::id(document_group), EInvalidCap);
        df::add(&mut document_group.id, document_id, MARKER);
    }

    // Publish a document to the document group (entry function)
    entry fun publish_document_entry(document_group: &mut DocumentGroup, cap: &AdminCap, document_id: String) {
        publish_document(document_group, cap, document_id);
    }
} 