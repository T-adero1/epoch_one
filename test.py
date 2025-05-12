

import string
import secrets
import random

def generate_military_grade_password(length=32):
    """
    Generates a cryptographically secure alphanumeric password:
    - Minimum 32 characters
    - Mix of uppercase, lowercase, and numbers
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
    
    # Ensure at least one of each type
    password = [
        secrets.choice(uppercase),
        secrets.choice(lowercase), 
        secrets.choice(digits)
    ]
    
    # Fill remaining length with random chars from all sets
    all_chars = uppercase + lowercase + digits
    for _ in range(length - 3):
        password.append(secrets.choice(all_chars))
        
    # Shuffle the password characters cryptographically
    random.SystemRandom().shuffle(password)
    
    return ''.join(password)

    # Example usage:
#print(generate_military_grade_password())
