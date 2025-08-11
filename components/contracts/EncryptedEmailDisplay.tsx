// Create new file: components/contracts/EncryptedEmailDisplay.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { decryptSignerEmails, canDecryptEmails } from '@/app/utils/emailEncryption';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';

interface EncryptedEmailDisplayProps {
  encryptedEmails: string[];
  contractOwnerGoogleIdHash: string;
  className?: string;
}

export default function EncryptedEmailDisplay({
  encryptedEmails,
  contractOwnerGoogleIdHash,
  className = ''
}: EncryptedEmailDisplayProps) {
  const { user } = useZkLogin();
  const [decryptedEmails, setDecryptedEmails] = useState<string[]>([]);
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [canDecrypt, setCanDecrypt] = useState(false);

  // Check if current user can decrypt emails
  useEffect(() => {
    const checkPermissions = async () => {
      if (!user?.googleId || !contractOwnerGoogleIdHash) {
        setCanDecrypt(false);
        return;
      }

      try {
        const allowed = await canDecryptEmails(contractOwnerGoogleIdHash, user.googleId);
        setCanDecrypt(allowed);
      } catch (error) {
        console.error('Error checking decrypt permissions:', error);
        setCanDecrypt(false);
      }
    };

    checkPermissions();
  }, [user?.googleId, contractOwnerGoogleIdHash]);

  const handleDecrypt = async () => {
    if (!user?.googleId || !canDecrypt || isDecrypting) return;

    setIsDecrypting(true);
    try {
      const emails = await decryptSignerEmails(encryptedEmails, user.googleId);
      setDecryptedEmails(emails);
      setIsDecrypted(true);
    } catch (error) {
      console.error('Failed to decrypt emails:', error);
      alert('Failed to decrypt emails. You may not have permission.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleHide = () => {
    setDecryptedEmails([]);
    setIsDecrypted(false);
  };

  if (!canDecrypt) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        {encryptedEmails.length} encrypted email(s) - View not authorized
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">Signer Emails:</span>
        <Button
          size="sm"
          variant="outline"
          onClick={isDecrypted ? handleHide : handleDecrypt}
          disabled={isDecrypting}
          className="h-6 px-2 text-xs"
        >
          {isDecrypting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isDecrypted ? (
            <>
              <EyeOff className="h-3 w-3 mr-1" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" />
              Decrypt & View
            </>
          )}
        </Button>
      </div>
      
      {isDecrypted ? (
        <div className="space-y-1">
          {decryptedEmails.map((email, index) => (
            <div
              key={index}
              className="text-sm bg-blue-50 px-2 py-1 rounded border"
            >
              {email}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          {encryptedEmails.length} encrypted email(s) - Click to decrypt
        </div>
      )}
    </div>
  );
}