from pysui.sui.sui_crypto import SuiKeyPair
import base64

def generate_sui_wallet():
    """
    Generate a new SUI wallet keypair and print the details
    
    Returns:
        SuiKeyPair: The generated wallet keypair
    """
    # Generate new keypair
    keypair = SuiKeyPair.generate()
    
    # Get address and keys
    address = keypair.public_key.to_address() 
    private_key = base64.b64encode(keypair.private_key_bytes()).decode()
    public_key = base64.b64encode(keypair.public_key_bytes()).decode()
    
    # Print wallet details
    print("\n=== Generated New SUI Wallet ===")
    print(f"Address: {address}")
    print(f"Private Key (base64): {private_key}")
    print(f"Public Key (base64): {public_key}")
    print("===============================\n")
    
    return keypair

def generate_multiple_wallets(num_wallets: int):
    """
    Generate multiple SUI wallets
    
    Args:
        num_wallets: Number of wallets to generate
        
    Returns:
        list[SuiKeyPair]: List of generated wallet keypairs
    """
    print(f"\nGenerating {num_wallets} SUI wallets...")
    wallets = []
    
    for i in range(num_wallets):
        print(f"\nWallet #{i+1}:")
        wallet = generate_sui_wallet()
        wallets.append(wallet)
        
    return wallets

if __name__ == "__main__":
    # Generate a single wallet
    generate_sui_wallet()
    
    # Generate multiple wallets
    generate_multiple_wallets(3)
