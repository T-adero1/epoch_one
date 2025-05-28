export const isValidEmail = (email: string): boolean => {
  // More comprehensive email regex that ensures proper format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Basic checks
  if (!email || typeof email !== 'string') return false;
  
  const trimmedEmail = email.trim();
  
  // Check minimum length
  if (trimmedEmail.length < 5) return false;
  
  // Check maximum length (RFC 5321 limit)
  if (trimmedEmail.length > 254) return false;
  
  // Must contain exactly one @
  const atCount = (trimmedEmail.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  
  // Must contain at least one dot after @
  const atIndex = trimmedEmail.indexOf('@');
  const domainPart = trimmedEmail.substring(atIndex + 1);
  if (!domainPart.includes('.')) return false;
  
  // Check against regex
  if (!emailRegex.test(trimmedEmail)) return false;
  
  // Additional checks for common issues
  if (trimmedEmail.startsWith('.') || trimmedEmail.endsWith('.')) return false;
  if (trimmedEmail.includes('..')) return false;
  if (trimmedEmail.startsWith('@') || trimmedEmail.endsWith('@')) return false;
  
  return true;
};

export const validateSignerEmail = (email: string, currentUserEmail?: string): {
  isValid: boolean;
  error?: string;
} => {
  const trimmedEmail = email.trim();
  
  // Check if empty
  if (!trimmedEmail) {
    return { isValid: false, error: 'Email address is required' };
  }
  
  // Check basic email format
  if (!isValidEmail(trimmedEmail)) {
    if (!trimmedEmail.includes('@')) {
      return { isValid: false, error: 'Email must contain an @ symbol' };
    }
    if (!trimmedEmail.includes('.')) {
      return { isValid: false, error: 'Email must contain a domain (e.g., .com, .org)' };
    }
    if (trimmedEmail.startsWith('@') || trimmedEmail.endsWith('@')) {
      return { isValid: false, error: 'Email cannot start or end with @' };
    }
    if (trimmedEmail.includes('..')) {
      return { isValid: false, error: 'Email cannot contain consecutive dots' };
    }
    if (trimmedEmail.length < 5) {
      return { isValid: false, error: 'Email is too short' };
    }
    if (trimmedEmail.length > 254) {
      return { isValid: false, error: 'Email is too long' };
    }
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  
  // Check if user is trying to add themselves
  if (currentUserEmail && trimmedEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
    return { isValid: false, error: 'You cannot add yourself as a signer' };
  }
  
  return { isValid: true };
};

export const validateSignerEmails = (emails: string[], currentUserEmail?: string): { 
  valid: string[], 
  invalid: string[],
  errors: string[]
} => {
  const valid: string[] = [];
  const invalid: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  
  emails.forEach((email, index) => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      // Skip empty emails
      return;
    }
    
    const validation = validateSignerEmail(trimmedEmail, currentUserEmail);
    
    if (!validation.isValid) {
      invalid.push(email);
      errors.push(validation.error || 'Invalid email');
      return;
    }
    
    const lowerEmail = trimmedEmail.toLowerCase();
    
    // Check for duplicates
    if (seen.has(lowerEmail)) {
      invalid.push(email);
      errors.push('This email is already added');
      return;
    }
    
    seen.add(lowerEmail);
    valid.push(lowerEmail);
  });
  
  return { valid, invalid, errors };
}; 