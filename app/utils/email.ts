export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateSignerEmails = (emails: string[]): { valid: string[], invalid: string[] } => {
  const valid: string[] = [];
  const invalid: string[] = [];
  
  emails.forEach(email => {
    if (isValidEmail(email.trim())) {
      valid.push(email.trim().toLowerCase());
    } else {
      invalid.push(email);
    }
  });
  
  return { valid, invalid };
}; 