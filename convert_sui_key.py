import base64

def decode_sui_private_key(sui_private_key: str) -> bytes:
    """
    Decode a Sui format private key (suiprivatekey1{base64} or suiprivkey1{base64}) to raw bytes
    
    Args:
        sui_private_key: The private key in Sui format
        
    Returns:
        bytes: The raw private key bytes
    """
    if sui_private_key.startswith("suiprivatekey1"):
        prefix = "suiprivatekey1"
    elif sui_private_key.startswith("suiprivkey1"):
        prefix = "suiprivkey1"
    else:
        raise ValueError("Invalid Sui private key format. Must start with 'suiprivatekey1' or 'suiprivkey1'")
        
    encoded_part = sui_private_key[len(prefix):]
    
    # Add padding if necessary to make it a valid base64 string
    padding_needed = len(encoded_part) % 4
    if padding_needed:
        encoded_part += '=' * (4 - padding_needed)
    
    try:
        return base64.b64decode(encoded_part)
    except Exception as e:
        raise ValueError(f"Failed to decode Sui private key: {e}")

def main():
    print("Sui Private Key Converter")
    print("========================")
    sui_key = input("Enter your suiprivatekey1 or suiprivkey1 format key: ")
    
    try:
        private_key_bytes = decode_sui_private_key(sui_key)
        
        # Convert to hexadecimal format (with 0x prefix)
        hex_format = "0x" + private_key_bytes.hex()
        
        print("\nConverted Private Key Formats:")
        print(f"Decoded byte length: {len(private_key_bytes)} bytes")
        print(f"Full key (hex): {hex_format}")
        
        # If the key is longer than 32 bytes, extract the first 32 bytes
        if len(private_key_bytes) > 32:
            truncated_key = private_key_bytes[:32]
            truncated_hex = "0x" + truncated_key.hex()
            print("\nDetected key larger than 32 bytes. Here's the 32-byte version:")
            print(f"Truncated key (hex): {truncated_hex}")
            
    except ValueError as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main() 