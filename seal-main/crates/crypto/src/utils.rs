// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use fastcrypto::error::FastCryptoError::InvalidInput;
use fastcrypto::error::FastCryptoResult;
use fastcrypto::traits::AllowedRng;
use itertools::Itertools;

pub(crate) fn xor<const N: usize>(a: &[u8; N], b: &[u8; N]) -> [u8; N] {
    xor_unchecked(a, b)
        .try_into()
        .expect("Inputs are guaranteed to have the same lengths")
}

/// XOR two byte slices together.
/// If one of the slices is shorter than the other, the result will be the length of the shorter slice.
pub(crate) fn xor_unchecked(a: &[u8], b: &[u8]) -> Vec<u8> {
    a.iter().zip(b.iter()).map(|(x, y)| x ^ y).collect()
}

pub(crate) fn generate_random_bytes<R: AllowedRng, const N: usize>(rng: &mut R) -> [u8; N] {
    let mut bytes = [0u8; N];
    rng.fill_bytes(&mut bytes);
    bytes
}

/// Convert N vectors of the same length, M, into M arrays of length N such that matrix[i][j] = transpose(&matrix)[j][i].
/// Returns with an InvalidInput error if the input does not have length equal to N
/// or if the elements of this vector do not all have the same length.
pub(crate) fn transpose<const N: usize>(matrix: &[Vec<u8>]) -> FastCryptoResult<Vec<[u8; N]>> {
    if matrix.len() != N || matrix.is_empty() {
        return Err(InvalidInput);
    }
    let m = matrix
        .iter()
        .map(Vec::len)
        .all_equal_value()
        .map_err(|_| InvalidInput)?;

    Ok((0..m)
        .map(|i| {
            matrix
                .iter()
                .map(|row| row[i])
                .collect_vec()
                .try_into()
                .expect("This will never fail since the length is guaranteed to be N")
        })
        .collect())
}
