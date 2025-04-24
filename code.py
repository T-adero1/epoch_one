import random
import string

def generate_strong_password(length=80, include_ambiguous=True, min_special=10, min_numbers=10, min_upper=10, min_lower=10):
    """
    Generate a strong password with specified length and requirements.
    
    Args:
        length (int): Total length of password (default 16)
        include_ambiguous (bool): Whether to include ambiguous characters like l,1,O,0 (default False)
        min_special (int): Minimum number of special characters required (default 1)
        min_numbers (int): Minimum number of numbers required (default 1) 
        min_upper (int): Minimum number of uppercase letters required (default 1)
        min_lower (int): Minimum number of lowercase letters required (default 1)
    
    Returns:
        str: Generated password meeting all requirements
    
    Raises:
        ValueError: If length is too short to meet minimum requirements
    """
    # Validate inputs
    min_total = min_special + min_numbers + min_upper + min_lower
    if length < min_total:
        raise ValueError(f"Password length {length} is too short to meet minimum requirements of {min_total} characters")

    # Define character sets
    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits = string.digits
    special = "!@#$%^&*()_+-=[]{}|;:,.<>?"

    # Remove ambiguous characters if specified
    if not include_ambiguous:
        uppercase = ''.join(c for c in uppercase if c not in 'O')
        lowercase = ''.join(c for c in lowercase if c not in 'l')
        digits = ''.join(c for c in digits if c not in '01')
        special = ''.join(c for c in special if c not in '|')

    # Initialize password with minimum requirements
    password = []
    
    # Add minimum special characters
    for _ in range(min_special):
        password.append(random.choice(special))
        
    # Add minimum numbers
    for _ in range(min_numbers):
        password.append(random.choice(digits))
        
    # Add minimum uppercase
    # Ensure at least one of each type
    password = [
        random.choice(uppercase),
        random.choice(lowercase), 
        random.choice(digits),
        random.choice(special)
    ]

    # Fill remaining length with random chars from all sets
    all_chars = uppercase + lowercase + digits + special
    for _ in range(length - 4):
        password.append(random.choice(all_chars))

    # Shuffle the password characters
    random.shuffle(password)
    
    return ''.join(password)

# Example usage:
password = generate_strong_password()
print(password)
