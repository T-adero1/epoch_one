

import string
import secrets
import random

def generate_military_grade_password(length=32):
    """
    Generates a cryptographically secure alphanumeric password:
    - Minimum 32 characters
    - Mix of uppercase, lowercase, numbers and symbols
    - Uses cryptographically secure random generation
    - Ensures all character types are included
    - Randomizes character positions
    """
    if length < 32:
        length = 32  # Enforce minimum length
        
    # Define character sets
    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits = string.digits
    symbols = string.punctuation
    
    # Ensure at least one of each type
    password = [
        secrets.choice(uppercase),
        secrets.choice(lowercase), 
        secrets.choice(digits),
        secrets.choice(symbols)
    ]
    
    # Fill remaining length with random chars from all sets
    all_chars = uppercase + lowercase + digits + symbols
    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))
        
    # Shuffle the password characters cryptographically
    random.SystemRandom().shuffle(password)
    
    return ''.join(password)

    # Example usage:
print(generate_military_grade_password())
