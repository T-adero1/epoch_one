module jybrJWT::jwt_expiry_checker;

use sui::clock::Clock;
use jybr::allowlist::{Self as allowlist, Allowlist};  // ✅ Import the module functions

/// Check if JWT is expired using public accessor
public fun is_jwt_expired(
    allowlist_obj: &Allowlist,
    user: address,
    clock: &Clock
): bool {
    allowlist::is_jwt_expired(allowlist_obj, user, clock)  // ✅ Use public function
}

/// Only approve if the JWT is NOT expired
entry fun conditional_seal_approve(
    allowlist_obj: &Allowlist,
    user: address,
    clock: &Clock
) {
    assert!(!is_jwt_expired(allowlist_obj, user, clock), 0);
    // Approval logic would still need to be in main contract
}
