module jybr::zklogin_verification;

use std::string::String;
use sui::zklogin_verified_issuer;

/// Verify that an address is a valid zkLogin wallet
/// Returns true if the address was derived using zkLogin with the given parameters
public fun is_zklogin_wallet(
    wallet_address: address,
    address_seed: u256,
    issuer: &String
): bool {
    zklogin_verified_issuer::check_zklogin_issuer(
        wallet_address,
        address_seed,
        issuer
    )
}
