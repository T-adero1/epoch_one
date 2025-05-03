# Sui Wallet Generator

A Python implementation of a Sui blockchain wallet generator with mnemonic support.

## Features

- Generate new Sui wallets with random keys
- Recover wallets from mnemonic phrases (BIP39 seed phrases)
- Create wallets from existing private keys
- Sign messages and verify signatures
- Generate Sui-compatible addresses

## Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

## Usage

### Generate a new wallet

```python
from suiwallet import generate_wallet

wallet = generate_wallet()
wallet_info = wallet.to_dict()

print(f"Address: {wallet_info['address']}")
print(f"Public Key: {wallet_info['publicKey']}")
print(f"Private Key: {wallet_info['privateKey']}")
print(f"Mnemonic: {wallet_info['mnemonic']}")
```

### Recover a wallet from mnemonic

```python
from suiwallet import wallet_from_mnemonic

mnemonic = "your twelve word mnemonic phrase goes here"
wallet = wallet_from_mnemonic(mnemonic)
print(f"Recovered Address: {wallet.address}")
```

### Create a wallet from private key

```python
from suiwallet import wallet_from_private_key

# Can accept hex string with or without 0x prefix
private_key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
wallet = wallet_from_private_key(private_key)
print(f"Wallet Address: {wallet.address}")
```

### Sign and verify messages

```python
message = b"Hello Sui!"
signature = wallet.sign_message(message)
print(f"Signature: 0x{signature.hex()}")

is_valid = wallet.verify_signature(message, signature)
print(f"Signature is valid: {is_valid}")
```

## Notes

This implementation uses:
- PyNaCl for Ed25519 cryptography operations
- The mnemonic package for BIP39 seed phrase generation
- Standard Python libraries for the rest of the functionality

For production use, additional security measures and proper key derivation should be implemented.
