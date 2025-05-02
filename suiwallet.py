import os
import hashlib
import binascii
import hmac
import base64
from typing import Dict, Optional, Union


from mnemonic import Mnemonic

class SuiWallet:
    """
    A class for generating and managing Sui blockchain wallets
    """
    
    SUI_ADDRESS_LENGTH = 32
    DEFAULT_DERIVATION_PATH = "m/44'/784'/0'/0'/0'"  # Sui's derivation path
    
    def __init__(self, private_key: Optional[bytes] = None, mnemonic: Optional[str] = None):
        """
        Initialize a SuiWallet instance either with a private key or by generating a new one
        
        Args:
            private_key: Optional bytes of the private key
            mnemonic: Optional recovery phrase to generate the wallet from
        """
        if private_key and mnemonic:
            raise ValueError("Cannot provide both private_key and mnemonic")
            
        if mnemonic:
            self.mnemonic = mnemonic
            self.private_key = self._derive_private_key_from_mnemonic(mnemonic)
        elif private_key:
            self.private_key = private_key
            self.mnemonic = None
        else:
            # Generate new wallet
            self.mnemonic = self._generate_mnemonic()
            self.private_key = self._derive_private_key_from_mnemonic(self.mnemonic)
            
        # Create key pair from private key
        self.keypair = nacl.signing.SigningKey(self.private_key)
        self.public_key = bytes(self.keypair.verify_key)
        self.address = self._derive_address(self.public_key)

    @staticmethod
    def _generate_mnemonic(strength: int = 128) -> str:
        """
        Generate a new BIP39 mnemonic (recovery phrase)
        
        Args:
            strength: Bit strength of the mnemonic (128, 160, 192, 224, 256)
                     128 bits = 12 words, 256 bits = 24 words
                     
        Returns:
            str: The mnemonic phrase
        """
        mnemo = Mnemonic("english")
        return mnemo.generate(strength=strength)
    
    def _derive_private_key_from_mnemonic(self, mnemonic: str) -> bytes:
        """
        Derive a private key from a mnemonic phrase using the specified derivation path
        
        Args:
            mnemonic: The recovery phrase
            
        Returns:
            bytes: The private key
        """
        mnemo = Mnemonic("english")
        seed = mnemo.to_seed(mnemonic)
        
        # For simplicity, we'll use a hash of the seed as the private key
        # In a production environment, we would use proper BIP32 derivation
        private_key = hashlib.sha256(seed).digest()
        
        # Make sure it's a valid Ed25519 key
        return private_key[:32]
    
    @staticmethod
    def _derive_address(public_key: bytes) -> str:
        """
        Derive a Sui address from a public key
        
        Args:
            public_key: The public key bytes
            
        Returns:
            str: The Sui address
        """
        # Hash the public key with SHA3-256
        # Sui uses a scheme where the first byte indicates the signature scheme (0x00 for Ed25519)
        address_bytes = hashlib.sha3_256(b'\x00' + public_key).digest()[:SuiWallet.SUI_ADDRESS_LENGTH]
        # Convert to hex string
        return "0x" + address_bytes.hex()
    
    def sign_message(self, message: bytes) -> bytes:
        """
        Sign a message with the wallet's private key
        
        Args:
            message: The message bytes to sign
            
        Returns:
            bytes: The signature
        """
        return bytes(self.keypair.sign(message).signature)
    
    def verify_signature(self, message: bytes, signature: bytes) -> bool:
        """
        Verify a signature against a message
        
        Args:
            message: The original message bytes
            signature: The signature bytes to verify
            
        Returns:
            bool: True if the signature is valid
        """
        try:
            verify_key = self.keypair.verify_key
            verify_key.verify(message, signature)
            return True
        except Exception:
            return False
    
    def get_sui_private_key_format(self) -> str:
        """
        Get the private key in the Sui format: suiprivatekey1{base64_encoding}
        
        Returns:
            str: The private key in Sui format
        """
        encoded = base64.b64encode(self.private_key).decode('utf-8')
        return f"suiprivatekey1{encoded}"
    
    @staticmethod
    def decode_sui_private_key(sui_private_key: str) -> bytes:
        """
        Decode a Sui format private key (suiprivatekey1{base64}) to raw bytes
        
        Args:
            sui_private_key: The private key in Sui format
            
        Returns:
            bytes: The raw private key bytes
        """
        if not sui_private_key.startswith("suiprivatekey1"):
            raise ValueError("Invalid Sui private key format. Must start with 'suiprivatekey1'")
            
        encoded_part = sui_private_key[len("suiprivatekey1"):]
        try:
            return base64.b64decode(encoded_part)
        except Exception as e:
            raise ValueError(f"Failed to decode Sui private key: {e}")
            
    def to_dict(self) -> Dict:
        """
        Convert wallet to a dictionary representation
        
        Returns:
            Dict: Wallet information
        """
        result = {
            "address": self.address,
            "publicKey": "0x" + self.public_key.hex(),
            "privateKey": "0x" + self.private_key.hex(),
            "suiPrivateKey": self.get_sui_private_key_format()
        }
        
        if self.mnemonic:
            result["mnemonic"] = self.mnemonic
            
        return result
    
    def __str__(self) -> str:
        """String representation of the wallet"""
        return f"SuiWallet(address={self.address}, publicKey=0x{self.public_key.hex()[:10]}...)"


def generate_wallet() -> SuiWallet:
    """
    Generate a new random Sui wallet
    
    Returns:
        SuiWallet: A new wallet instance
    """
    return SuiWallet()


def wallet_from_mnemonic(mnemonic: str) -> SuiWallet:
    """
    Recover a wallet from a mnemonic phrase
    
    Args:
        mnemonic: The recovery phrase (typically 12 or 24 words)
        
    Returns:
        SuiWallet: The recovered wallet
    """
    return SuiWallet(mnemonic=mnemonic)


def wallet_from_private_key(private_key: Union[str, bytes]) -> SuiWallet:
    """
    Create a wallet from an existing private key
    
    Args:
        private_key: The private key as bytes or hex string
        
    Returns:
        SuiWallet: The wallet
    """
    if isinstance(private_key, str):
        # Remove '0x' prefix if present
        if private_key.startswith('0x'):
            private_key = private_key[2:]
        private_key = bytes.fromhex(private_key)
    
    return SuiWallet(private_key=private_key)


def wallet_from_sui_private_key(sui_private_key: str) -> SuiWallet:
    """
    Create a wallet from a Sui format private key (suiprivatekey1{base64})
    
    Args:
        sui_private_key: The private key in Sui format
        
    Returns:
        SuiWallet: The wallet
    """
    private_key_bytes = SuiWallet.decode_sui_private_key(sui_private_key)
    return SuiWallet(private_key=private_key_bytes)


if __name__ == "__main__":
    # Example usage
    print("Generating a new Sui wallet...")
    wallet = generate_wallet()
    wallet_info = wallet.to_dict()
    
    print(f"Address: {wallet_info['address']}")
    print(f"Public Key: {wallet_info['publicKey']}")
    print(f"Private Key: {wallet_info['privateKey']}")
    print(f"Sui Private Key: {wallet_info['suiPrivateKey']}")
    print(f"Mnemonic: {wallet_info['mnemonic']}")
    
    # Example of recovering a wallet from mnemonic
    print("\nRecovering wallet from mnemonic...")
    recovered_wallet = wallet_from_mnemonic(wallet_info['mnemonic'])
    print(f"Recovered Address: {recovered_wallet.address}")
    
    # Example of signing a message
    message = b"Hello Sui!"
    signature = wallet.sign_message(message)
    print(f"\nSigned message. Signature: 0x{signature.hex()[:20]}...")
    
    # Verify the signature
    is_valid = wallet.verify_signature(message, signature)
    print(f"Signature verification: {is_valid}")
    
    # Example of recovering from Sui private key format
    print("\nRecovering wallet from Sui private key format...")
    sui_private_key = wallet_info['suiPrivateKey']
    recovered_from_sui_format = wallet_from_sui_private_key(sui_private_key)
    print(f"Recovered Address: {recovered_from_sui_format.address}")
    print(f"Original Address:  {wallet.address}")
    print(f"Keys match: {recovered_from_sui_format.private_key == wallet.private_key}")
