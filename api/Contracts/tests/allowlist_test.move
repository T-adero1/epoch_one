#[test_only]
module walrus::allowlist_tests {
    use sui::test_scenario as ts;
    use sui::clock;
    use walrus::allowlist::{Self, Allowlist, Cap};
    
    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCAFE;
    const EPHEMERAL: address = @0xE1234;
    
    #[test]
    fun test_allowlist_basic_operations() {
        let mut scenario = ts::begin(ADMIN);
        
        // Create allowlist
        create_allowlist_for_test(&mut scenario);
        
        // Add users to allowlist
        test_add_users(&mut scenario);
        
        // Publish document
        test_publish_document(&mut scenario);
        
        ts::end(scenario);
    }
    
    #[test]
    fun test_ephemeral_key_lifecycle() {
        let mut scenario = ts::begin(ADMIN);
        
        // Create allowlist and add users
        create_allowlist_for_test(&mut scenario);
        test_add_users(&mut scenario);
        test_publish_document(&mut scenario);
        
        // Test ephemeral key authorization
        ts::next_tx(&mut scenario, ADMIN);
        let mut allowlist = ts::take_shared<Allowlist>(&scenario);
        let cap = ts::take_from_sender<Cap>(&scenario);
        
        // Create a test clock
        let ctx = ts::ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Authorize ephemeral key - 1 hour validity
        let one_hour_ms = 3600000;
        let doc_id = std::string::utf8(b"test_doc");
        
        allowlist::authorize_ephemeral_key(
            &mut allowlist, 
            EPHEMERAL, 
            doc_id, 
            one_hour_ms, 
            &clock, 
            ts::ctx(&mut scenario)
        );
        
        // Verify ephemeral key is valid
        assert!(allowlist::verify_ephemeral_key(&allowlist, EPHEMERAL, doc_id, &clock), 0);
        
        ts::return_to_sender(&scenario, cap);
        ts::return_shared(allowlist);
        clock::destroy_for_testing(clock);
        
        // Test ephemeral key expiry
        ts::next_tx(&mut scenario, ADMIN);
        let mut allowlist = ts::take_shared<Allowlist>(&scenario);
        
        // Create a test clock but 2 hours in the future
        let ctx = ts::ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        clock::increment_for_testing(&mut clock, 7200000); // 2 hours in ms
        
        // Verify the key is now expired
        let doc_id = std::string::utf8(b"test_doc");
        assert!(!allowlist::verify_ephemeral_key(&allowlist, EPHEMERAL, doc_id, &clock), 1);
        
        // Run cleanup
        allowlist::clean_expired_keys(&mut allowlist, &clock, ts::ctx(&mut scenario));
        
        ts::return_shared(allowlist);
        clock::destroy_for_testing(clock);
        
        ts::end(scenario);
    }
    
    fun create_allowlist_for_test(scenario: &mut ts::Scenario) {
        ts::next_tx(scenario, ADMIN);
        
        // Create allowlist with name "Test Allowlist"
        allowlist::create_allowlist_entry(
            std::string::utf8(b"Test Allowlist"),
            ts::ctx(scenario)
        );
        
        // Verify cap exists without asserting
        ts::next_tx(scenario, ADMIN);
        let cap = ts::take_from_sender<Cap>(scenario);
        ts::return_to_sender(scenario, cap);
    }
    
    fun test_add_users(scenario: &mut ts::Scenario) {
        ts::next_tx(scenario, ADMIN);
        
        let mut allowlist = ts::take_shared<Allowlist>(scenario);
        let cap = ts::take_from_sender<Cap>(scenario);
        
        // Create a dummy clock
        let ctx = ts::ctx(scenario);
        let clock = clock::create_for_testing(ctx);
        
        // Add ADMIN and other users
        let users = vector[ADMIN, USER1, USER2];
        allowlist::add_users_entry(&mut allowlist, &cap, users, &clock);
        
        ts::return_to_sender(scenario, cap);
        ts::return_shared(allowlist);
        clock::destroy_for_testing(clock);
    }
    
    fun test_publish_document(scenario: &mut ts::Scenario) {
        ts::next_tx(scenario, ADMIN);
        
        let mut allowlist = ts::take_shared<Allowlist>(scenario);
        let cap = ts::take_from_sender<Cap>(scenario);
        
        // Create a test clock
        let ctx = ts::ctx(scenario);
        let clock = clock::create_for_testing(ctx);
        
        // Create document ID
        let doc_id = std::string::utf8(b"test_doc");
        
        // Create user list
        let users = vector[USER1, USER2];
        
        // Publish document and add users
        allowlist::add_users_and_publish_entry(
            &mut allowlist,
            &cap,
            users,
            doc_id,
            &clock
        );
        
        ts::return_to_sender(scenario, cap);
        ts::return_shared(allowlist);
        clock::destroy_for_testing(clock);
    }
}
