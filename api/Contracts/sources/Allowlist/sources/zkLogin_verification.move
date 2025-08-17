module jybr::zklogin_verification;

use std::string::String;
use sui::zklogin_verified_issuer;
use sui::event;

/// Event emitted for successful zkLogin verifications
public struct ZkLoginVerified has copy, drop {
    wallet_address: address,
    issuer: String,
    verified_by: address
}

/// Verify zkLogin wallet 
public fun is_zklogin_wallet(
    wallet_address: address,
    address_seed: u256,
    issuer: &String,
    ctx: &TxContext
): bool {
    let result = zklogin_verified_issuer::check_zklogin_issuer(
        wallet_address,
        address_seed,
        issuer
    );
    
    // Only emit on success to avoid spam
    if (result) {
        event::emit(ZkLoginVerified {
            wallet_address,
            issuer: *issuer,
            verified_by: ctx.sender()
        });
    };
    
    result
}
