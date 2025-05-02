// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

module seal::hmac256ctr;

use std::{bcs, option::{none, some}};
use sui::hmac::hmac_sha3_256;

/// Decrypt a message that was encrypted in Hmac256Ctr mode.
public(package) fun decrypt(
    ciphertext: &vector<u8>,
    mac: &vector<u8>,
    aad: &vector<u8>,
    key: &vector<u8>,
): Option<vector<u8>> {
    if (mac(key, aad, ciphertext) != mac) {
        return none()
    };

    let encryption_key = hmac_sha3_256(key, &vector[1]);

    let mut next_block = 0;
    let mut i = 0;
    let mut current_mask = vector[];
    some(ciphertext.map_ref!(|b| {
        if (i == 0) {
            current_mask = hmac_sha3_256(&encryption_key, &bcs::to_bytes(&(next_block as u64)));
            next_block = next_block + 1;
        };
        let result = *b ^ current_mask[i];
        i = (i + 1) % 32;
        result
    }))
}

fun mac(key: &vector<u8>, aux: &vector<u8>, ciphertext: &vector<u8>): vector<u8> {
    let mut mac_input: vector<u8> = bcs::to_bytes(&aux.length());
    mac_input.append(*aux);
    mac_input.append(*ciphertext);

    let mac_key = hmac_sha3_256(key, &vector[2]);
    hmac_sha3_256(&mac_key, &mac_input)
}

#[test]
fun test_decrypt() {
    let key = x"4804597e77d5025ab89d8559fe826dbd5591aaa5a0a3ca19ea572350e2a08c6b";
    let ciphertext = x"98bf8da0ccbb35b6cf41effc83";
    let mac = x"6c3d7fdb9b3a16a552b43a3300d6493f328e97aebf0697645cd35348ac926ec2";
    let aux = b"something";
    let decrypted = decrypt(&ciphertext, &mac, &aux, &key).borrow();
    assert!(decrypted == b"Hello, world!");
}

#[test]
fun test_decrypt_fail() {
    let key = x"4804597e77d5025ab89d8559fe826dbd5591aaa5a0a3ca19ea572350e2a08c6b";
    let ciphertext = x"98bf8da0ccbb35b6cf41effc83";
    let mac = x"6c3d7fdb9b3a16a552b43a3300d6493f328e97aebf0697645cd35348ac926ec2";
    let aux = b"something else";
    assert!(decrypt(&ciphertext, &mac, &aux, &key) == none());
}

#[test]
fun test_decrypt_long() {
    let key = x"f44a2fa43047d60b0d306dd26da1ef64647d4903850d88e61f3fff1f856c3ae3";
    let ciphertext =
        x"3c0c31923589a18cb38c34802aa28de8831756c4c6f4043afa7e12c7e3dcd8f4798e7679983201f0d99f03a6f7c6c63752a8ac0deb0d1588120ae03e320238cb2ba4b458e336b7f70ad38ac23b5c149523a74817fb82bd4061fe101275638730239411";
    let mac = x"a26c79314ebe7c043506f779d669ce24fbff50f543f0074243d53aa5b661504a";
    let aux = b"Mark Twain";
    let decrypted = decrypt(&ciphertext, &mac, &aux, &key).borrow();
    assert!(
        decrypted == b"The difference between a Miracle and a Fact is exactly the difference between a mermaid and a seal.",
    );
}
