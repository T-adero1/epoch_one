module epoch_one_document_sharing::document_sharing {
    use sui::tx_context::{Self, TxContext};
    use sui::bcs;

    // Error codes
    const ENotAuthorized: u64 = 1;

    /// Access control function for SEAL
    /// The identity format is: BCS-encoded [contract_id][signer_addresses]
    /// This allows any of the contract signers to decrypt the document
    public entry fun seal_approve(bcs_id: vector<u8>, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        
        // Initialize BCS parser
        let bcs_parser = bcs::new(bcs_id);
        
        // Extract contract_id - first part is a vector<u8>
        let _contract_id = bcs::peel_vec_u8(&mut bcs_parser);
        
        // Next we have a vector of signer addresses
        // Get the number of addresses (first u32 in the vector encoding)
        let signer_count = bcs::peel_vec_length(&mut bcs_parser);
        
        // Check if sender is one of the allowed addresses
        let authorized = false;
        let i = 0;
        
        while (i < signer_count) {
            let signer_addr = bcs::peel_address(&mut bcs_parser);
            if (signer_addr == sender) {
                authorized = true;
                break
            };
            i = i + 1;
        };
        
        // Abort if the sender is not authorized
        assert!(authorized, ENotAuthorized);
        
        // If we get here, the sender is authorized to decrypt
    }
} 