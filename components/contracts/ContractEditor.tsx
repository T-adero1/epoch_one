'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, X, Plus, Trash2, User, Send, ChevronLeft, Sparkles, ArrowRight, Loader2, Brain, Wand2, FileText, Lightbulb, Check, AlertCircle, Info, Square, RotateCcw, Pen, MapPin } from 'lucide-react'
import { updateContract, ContractWithRelations } from '@/app/utils/contracts'
import { detectGroupedChanges, applyGroupedChanges, ChangeGroup } from '@/app/utils/textDiff'
import AIChangesReview from './AIChangesReview'
import ContractEditorWithDiff from './ContractEditorWithDiff'
import { toast } from '@/components/ui/use-toast'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { validateSignerEmail } from '@/app/utils/email'
import PDFEditor from './PDFEditor'
// **NEW: Import email decryption utilities**
import { decryptSignerEmails, canDecryptEmails } from '@/app/utils/emailEncryption'
// ✅ ADD: Import for hashing and wallet generation
import { hashGoogleId } from '@/app/utils/privacy'

// ✅ ADD: SignaturePosition interface (moved to top)
interface SignaturePosition {
  signerWallet: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContractEditorProps {
  contract: ContractWithRelations;
  onSave: (updatedContract: ContractWithRelations) => void;
  onCancel: () => void;
  startWithAI?: boolean;
}

// Define an interface for the original values
interface OriginalValues {
  content: string;
  title: string;
  description: string;
  signers: string[];
}

// Add this helper function at the top of the component
function isSpacingOnlyChange(group: ChangeGroup): boolean {
  const filteredOriginal = group.originalLines.filter(line => line.trim() !== '');
  const filteredNew = group.newLines.filter(line => line.trim() !== '');
  return filteredOriginal.length === 0 && filteredNew.length === 0;
}

// **NEW: Helper function to detect if emails are encrypted**
function areEmailsEncrypted(emails: string[]): boolean {
  if (!emails || emails.length === 0) return false;
  
  // Check if emails look like encrypted data (base64-like strings, not email format)
  return emails.some(email => {
    // Encrypted emails will be base64 strings, much longer than typical emails
    // and won't contain @ symbol or common email patterns
    return email.length > 50 && 
           !email.includes('@') && 
           /^[A-Za-z0-9+/=]+$/.test(email);
  });
}

export default function ContractEditor({ 
  contract, 
  onSave, 
  onCancel, 
  startWithAI = false
}: ContractEditorProps) {
  const { user } = useZkLogin();
  const [content, setContent] = useState(contract.content || '')
  const [title, setTitle] = useState(contract.title || '')
  const [description, setDescription] = useState(contract.description || '')
  const [signers, setSigners] = useState<string[]>([])
  
  // ✅ ADD: Missing save loading state
  const [saveLoading, setSaveLoading] = useState(false);
  
  // ✅ ADD ALL THESE MISSING STATE VARIABLES:
  // Signature positioning state
  const [signaturePositions, setSignaturePositions] = useState<SignaturePosition[]>([])
  const [signerWallets, setSignerWallets] = useState<string[]>([])
  const [selectedSignerWallet, setSelectedSignerWallet] = useState<string>('')
  const [isSignatureBoxMode, setIsSignatureBoxMode] = useState(false)
  
  // Track original values to detect changes with proper typing
  const [originalValues, setOriginalValues] = useState<OriginalValues>({
    content: contract.content || '',
    title: contract.title || '',
    description: contract.description || '',
    signers: contract.metadata?.signers || []
  })
  
  // State to track if any changes have been made
  const [hasChanges, setHasChanges] = useState(false)
  
  // AI functionality state
  const [showAIPanel, setShowAIPanel] = useState(startWithAI)
  const [aiQuery, setAiQuery] = useState('')
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [aiSuggestions] = useState([
    "Make this contract more professional and formal",
    "Add a confidentiality clause",
    "Include payment terms and conditions", 
    "Add termination and cancellation clauses",
    "Simplify the language for easier understanding",
    "Add liability and insurance provisions"
  ])
  const [aiSuggestion, setAiSuggestion] = useState<string>('')
  const [detectedChangeGroups, setDetectedChangeGroups] = useState<ChangeGroup[]>([])
  const [acceptedGroups, setAcceptedGroups] = useState<string[]>([])
  const [rejectedGroups, setRejectedGroups] = useState<string[]>([])
  const [showDiffMode, setShowDiffMode] = useState(false)
  
  // Enhanced state for validation errors with more detailed tracking
  const [signerErrors, setSignerErrors] = useState<string[]>([]);
  const [isValidatingEmail, setIsValidatingEmail] = useState<boolean[]>([]);
  
  // Add a state to track PDF file updates
  const [hasPdfFile, setHasPdfFile] = useState(!!contract.s3FileKey);
  
  // **NEW: Add state for managing decrypted emails**
  const [decryptedSigners, setDecryptedSigners] = useState<string[]>([]);
  const [isDecryptingSigners, setIsDecryptingSigners] = useState(false);
  const [canDecryptSigners, setCanDecryptSigners] = useState(false);
  const [signersDecrypted, setSignersDecrypted] = useState(false);
  
  // **NEW: Add state for decrypted PDF**
  const [decryptedPdfBlob, setDecryptedPdfBlob] = useState<Blob | null>(null);

  // **NEW: Check if current user can decrypt emails**
  useEffect(() => {
    const checkDecryptPermissions = async () => {
      if (!user?.googleId || !contract.ownerGoogleIdHash) {
        setCanDecryptSigners(false);
        return;
      }

      try {
        const allowed = await canDecryptEmails(contract.ownerGoogleIdHash, user.googleId);
        setCanDecryptSigners(allowed);
      } catch (error) {
        console.error('[ContractEditor] Error checking decrypt permissions:', error);
        setCanDecryptSigners(false);
      }
    };

    checkDecryptPermissions();
  }, [user?.googleId, contract.ownerGoogleIdHash]);

  // **NEW: Auto-decrypt emails if user is owner and emails are encrypted**
  useEffect(() => {
    const autoDecryptSigners = async () => {
      const contractSigners = contract.metadata?.signers || [];
      
      if (!contractSigners.length || !canDecryptSigners || signersDecrypted) return;
      
      // Check if emails look encrypted
      if (!areEmailsEncrypted(contractSigners)) {
        // Emails are not encrypted, use them as-is
        setDecryptedSigners(contractSigners);
        setSignersDecrypted(true);
        return;
      }

      // Emails are encrypted, attempt to decrypt
      if (user?.googleId) {
        setIsDecryptingSigners(true);
        try {
          console.log('[ContractEditor] Auto-decrypting signer emails...');
          const decrypted = await decryptSignerEmails(contractSigners, user.googleId);
          setDecryptedSigners(decrypted);
          setSignersDecrypted(true);
          console.log('[ContractEditor] Successfully decrypted', decrypted.length, 'signer emails');
        } catch (error) {
          console.error('[ContractEditor] Auto-decryption failed:', error);
          // Fallback to encrypted emails for display (though they won't be usable for editing)
          setDecryptedSigners([]);
        } finally {
          setIsDecryptingSigners(false);
        }
      }
    };

    autoDecryptSigners();
  }, [contract.metadata?.signers, canDecryptSigners, user?.googleId, signersDecrypted]);
  
  // **UPDATED: Initialize values when contract changes - use decrypted emails when available**
  useEffect(() => {
    setContent(contract.content || '')
    setTitle(contract.title || '')
    setDescription(contract.description || '')
    setHasPdfFile(!!contract.s3FileKey)
    
    // **UPDATED: Use decrypted signers if available, otherwise use original**
    const contractSigners = signersDecrypted && decryptedSigners.length > 0 
      ? decryptedSigners 
      : contract.metadata?.signers || []
      
    setSigners(contractSigners.length ? [...contractSigners] : [''])
    
    // **UPDATED: Use decrypted signers for original values too**
    setOriginalValues({
      content: contract.content || '',
      title: contract.title || '',
      description: contract.description || '',
      signers: signersDecrypted && decryptedSigners.length > 0 
        ? decryptedSigners 
        : contract.metadata?.signers || []
    })
    
    setHasChanges(false)
  }, [contract, signersDecrypted, decryptedSigners])
  
  // **UPDATED: Also update signers when decryption completes**
  useEffect(() => {
    if (signersDecrypted && decryptedSigners.length > 0) {
      // Only update if signers are currently empty or contain encrypted data
      const currentSignersLookEncrypted = areEmailsEncrypted(signers);
      
      if (signers.length === 0 || currentSignersLookEncrypted || (signers.length === 1 && signers[0] === '')) {
        console.log('[ContractEditor] Updating signers with decrypted emails');
        setSigners([...decryptedSigners]);
        
        // Update original values to use decrypted emails
        setOriginalValues(prev => ({
          ...prev,
          signers: [...decryptedSigners]
        }));
      }
    }
  }, [signersDecrypted, decryptedSigners]);
  
  // Check for changes whenever form values change
  useEffect(() => {
    const contentChanged = content !== originalValues.content
    const titleChanged = title !== originalValues.title
    const descriptionChanged = description !== originalValues.description
    
    // Check if signers have changed
    let signersChanged = false
    const filteredSigners = signers.filter(s => s.trim() !== '')
    
    if (filteredSigners.length !== originalValues.signers.length) {
      signersChanged = true
    } else {
      for (let i = 0; i < filteredSigners.length; i++) {
        if (filteredSigners[i] !== originalValues.signers[i]) {
          signersChanged = true
          break
        }
      }
    }
    
    setHasChanges(contentChanged || titleChanged || descriptionChanged || signersChanged)
  }, [content, title, description, signers, originalValues])
  
  const handleAddSigner = () => {
    setSigners([...signers, ''])
  }
  
  const handleRemoveSigner = (index: number) => {
    const newSigners = [...signers]
    newSigners.splice(index, 1)
    setSigners(newSigners.length ? newSigners : [''])
  }
  
  // Enhanced handleSignerChange with comprehensive validation
  const handleSignerChange = (index: number, value: string) => {
    const newSigners = [...signers];
    const newErrors = [...signerErrors];
    const newValidating = [...isValidatingEmail];
    
    newSigners[index] = value; // Keep original case for display
    newValidating[index] = true;
    
    // Clear previous error
    newErrors[index] = '';
    
    setSigners(newSigners);
    setSignerErrors(newErrors);
    setIsValidatingEmail(newValidating);
    
    // Debounced validation
    setTimeout(() => {
      const trimmedValue = value.trim();
      const updatedErrors = [...signerErrors];
      const updatedValidating = [...isValidatingEmail];
      
      if (trimmedValue) {
        // Validate the email
        const validation = validateSignerEmail(trimmedValue, user?.email);
        
        if (!validation.isValid) {
          updatedErrors[index] = validation.error || 'Invalid email';
        } else {
          // Check for duplicates in current signers list
          const lowerValue = trimmedValue.toLowerCase();
          const duplicateIndex = newSigners.findIndex((s, i) => 
            i !== index && s.trim().toLowerCase() === lowerValue
          );
          
          if (duplicateIndex !== -1) {
            updatedErrors[index] = 'This email is already added';
          }
        }
      }
      
      updatedValidating[index] = false;
      setSignerErrors(updatedErrors);
      setIsValidatingEmail(updatedValidating);
    }, 500); // 500ms debounce
  };

  // ContractEditor.tsx - Simplified handleSave
  const handleSave = async () => {
    const saveStartTime = performance.now();
    console.log('[FLOW] 5. Save process initiated', {
      contractId: contract.id,
      signaturePositionsCount: signaturePositions.length,
      hasChanges,
      hasDecryptedBlob: !!decryptedPdfBlob,
      saveStartTime
    });

    try {
      // Prevent saving if there are validation errors
      const hasValidationErrors = signerErrors.some(error => error !== '');
      if (hasValidationErrors) {
        toast({
          title: "Validation Error", 
          description: "Please fix all validation errors before saving.",
          variant: "destructive",
        });
        return;
      }

      setSaveLoading(true);
      
      // ✅ NEVER update metadata during signature box operations
      const isSignatureBoxSave = signaturePositions.length > 0;
      
      if (isSignatureBoxSave) {
        console.log('[FLOW] Signature box save - preserving all metadata');
        
        // Only update: title, description, content, signaturePositions
        const basicUpdates = {
          title,
          description: description || undefined, 
          content,
          signaturePositions: JSON.stringify(signaturePositions)
        };
        
        const updatedContract = await updateContract(contract.id, basicUpdates);
        
        // STEP 3: Handle PDF modification (if signature boxes exist)
        if (signaturePositions.length > 0 && contract.s3FileKey) {
          console.log('[FLOW] 8. Modifying and encrypting PDF with signature boxes');
          
          // Clear cache
          try {
            const { pdfCache } = await import('@/app/utils/pdfCache');
            await pdfCache.clearEncryptedPDF(contract.id);
            await pdfCache.clearDecryptedPDF(contract.id);
          } catch (cacheError) {
            console.warn('[FLOW] Cache clear failed:', cacheError);
          }
          
          // Get encrypted PDF bytes
          const encryptedPdfBytes = await modifyAndEncryptPDF(signaturePositions, walletEmailMap);
          
          // Upload new file
          const uploadResult = await uploadEncryptedPDFToAWS(encryptedPdfBytes);
          
          // ✅ Update ONLY file-related fields (no metadata)
          const finalUpdatedContract = await updateContract(contract.id, {
            s3FileKey: uploadResult.s3FileKey,
            s3FileName: uploadResult.s3FileName,
            s3FileSize: encryptedPdfBytes.length
          });
          
          // Clear signature positions
          setSignaturePositions([]);
          
          // Reset change tracking
          setOriginalValues({ title, description, content, signers });
          setHasChanges(false);
          
          onSave(finalUpdatedContract);
          
        } else {
          // No signature boxes
          setOriginalValues({ title, description, content, signers });
          setHasChanges(false);
          onSave(updatedContract);
        }
        
        toast({
          title: "Contract saved",
          description: "Your changes have been saved successfully.",
          variant: "success",
        });
        
      } else {
        // STEP 1: Save metadata to database
        console.log('[FLOW] 6. Saving contract metadata to database', {
          contractId: contract.id,
          title,
          description,
          signaturePositionsData: JSON.stringify(signaturePositions),
          positionsCount: signaturePositions.length
        });
        
        const shouldUseDecryptedEmails = signersDecrypted && decryptedSigners.length > 0;
        
        // ✅ STEP 1: Only update basic fields that changed (NO metadata changes)
        const basicUpdates: any = {};
        
        if (title !== originalValues.title) basicUpdates.title = title;
        if (description !== originalValues.description) basicUpdates.description = description || undefined;
        if (content !== originalValues.content) basicUpdates.content = content;
        
        // Always update signature positions (this is safe)
        basicUpdates.signaturePositions = JSON.stringify(signaturePositions);
        
        console.log('[FLOW] 6. Saving basic contract updates (no metadata):', basicUpdates);
        
        const updatedContract = await updateContract(contract.id, basicUpdates);
        
        // ✅ STEP 2: Only update signers if they actually changed AND user can decrypt them
        const signersChanged = JSON.stringify(signers) !== JSON.stringify(originalValues.signers);
        
        if (signersChanged && signersDecrypted && decryptedSigners.length > 0) {
          console.log('[FLOW] 6.1. Signers changed, updating metadata separately');
          
          // Preserve ALL existing metadata, only update signers
          const metadataUpdate = {
            metadata: {
              ...contract.metadata,  // ✅ Preserve authorized users and all other fields
              signers: signers       // ✅ Only update signers if they actually changed
            }
          };
          
          await updateContract(contract.id, metadataUpdate);
          console.log('[FLOW] 6.2. Signers metadata updated without affecting other fields');
        } else {
          console.log('[FLOW] 6.1. Signers unchanged, preserving existing metadata');
        }
        
        // STEP 3: Handle PDF modification (if signature boxes exist)
        if (signaturePositions.length > 0 && contract.s3FileKey) {
          console.log('[FLOW] 8. Modifying and encrypting PDF with signature boxes');
          
          // Clear cache
          try {
            const { pdfCache } = await import('@/app/utils/pdfCache');
            await pdfCache.clearEncryptedPDF(contract.id);
            await pdfCache.clearDecryptedPDF(contract.id);
          } catch (cacheError) {
            console.warn('[FLOW] Cache clear failed:', cacheError);
          }
          
          // Get encrypted PDF bytes (with embedded signature boxes)
          const encryptedPdfBytes = await modifyAndEncryptPDF(signaturePositions, walletEmailMap);
          
          console.log('[FLOW] 9. Uploading re-encrypted PDF to AWS');
          
          // Upload new encrypted version to AWS
          const uploadResult = await uploadEncryptedPDFToAWS(encryptedPdfBytes);
          
          console.log('[FLOW] 10. Updating database with new file info');
          
          // Update database with new file location and size
          const finalUpdatedContract = await updateContract(contract.id, {
            s3FileKey: uploadResult.s3FileKey,
            s3FileName: uploadResult.s3FileName,
            s3FileSize: encryptedPdfBytes.length
          });
          
          // ✅ CLEAR: Clear signature positions since they're now embedded in PDF
          setSignaturePositions([]);
          
          console.log('[FLOW] 10.1. Signature boxes embedded and positions cleared from state');
          
          // Reset change tracking
          setOriginalValues({ title, description, content, signers });
          setHasChanges(false);
          
          // ✅ CRITICAL: Pass the FINAL updated contract with new S3 key
          onSave(finalUpdatedContract);  // ← This has the NEW s3FileKey
          
        } else {
          console.log('[FLOW] 8. PDF modification skipped', {
            contractId: contract.id,
            reason: signaturePositions.length === 0 ? 'no_signature_positions' : 'no_pdf_file',
            signaturePositionsCount: signaturePositions.length,
            hasPDF: !!contract.s3FileKey
          });
          // No signature boxes, just pass the first update
          setOriginalValues({ title, description, content, signers });
          setHasChanges(false);
          onSave(updatedContract);
        }
        
        toast({
          title: "Contract saved",
          description: `Your changes have been saved successfully. ${signaturePositions.length} signature boxes ${signaturePositions.length > 0 ? 'embedded in PDF and cache cleared' : 'saved'}.`,
          variant: "success",
        });
        
      }
      
    } catch (error) {
      const totalSaveTime = Math.round(performance.now() - saveStartTime);
      console.error('[FLOW] Save process failed', {
        contractId: contract.id,
        error: error,
        totalSaveTime,
        signaturePositionsCount: signaturePositions.length
      });
      
      toast({
        title: "Error",
        description: "Failed to save contract. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Helper function to get valid signers count
  const getValidSignersCount = () => {
    return signers.filter((s, index) => 
      s.trim() !== '' && !signerErrors[index]
    ).length;
  };

  // Helper function to check if all signers are valid
  const areAllSignersValid = () => {
    const nonEmptySigners = signers.filter(s => s.trim() !== '');
    return nonEmptySigners.length > 0 && 
           signerErrors.every(error => error === '') &&
           !isValidatingEmail.some(validating => validating);
  };

  const handleAIEdit = async () => {
    if (!aiQuery.trim()) return
    
    setIsAIProcessing(true)
    try {
      const response = await fetch('/api/ai/edit-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentContent: content,
          query: aiQuery,
          contractTitle: title,
          contractDescription: description
        })
      })
      
      if (!response.ok) {
        throw new Error('AI editing failed')
      }
      
      const data = await response.json()
      setAiSuggestion(data.editedContent)
      
      // Detect grouped changes
      const diffResult = detectGroupedChanges(content, data.editedContent)
      setDetectedChangeGroups(diffResult.changeGroups)
      
      // Automatically accept spacing-only changes
      const spacingOnlyGroups = diffResult.changeGroups
        .filter(group => group.type !== 'unchanged' && isSpacingOnlyChange(group))
        .map(group => group.id);
      
      setAcceptedGroups(spacingOnlyGroups)
      setRejectedGroups([])
      setShowDiffMode(true)
      setShowAIPanel(false)
      setAiQuery('')
      
    } catch (error) {
      console.error('AI editing error:', error)
    } finally {
      setIsAIProcessing(false)
    }
  }

  const handleAcceptGroup = (groupId: string) => {
    setAcceptedGroups(prev => [...prev, groupId])
    setRejectedGroups(prev => prev.filter(id => id !== groupId))
  }

  const handleRejectGroup = (groupId: string) => {
    setRejectedGroups(prev => [...prev, groupId])
    setAcceptedGroups(prev => prev.filter(id => id !== groupId))
  }

  const handleAcceptAllChanges = () => {
    const changeableIds = detectedChangeGroups
      .filter(group => group.type !== 'unchanged')
      .map(group => group.id)
    setAcceptedGroups(changeableIds)
    setRejectedGroups([])
  }

  const handleRejectAllChanges = () => {
    const changeableIds = detectedChangeGroups
      .filter(group => group.type !== 'unchanged')
      .map(group => group.id)
    setRejectedGroups(changeableIds)
    setAcceptedGroups([])
  }

  const handleApplyChanges = () => {
    const updatedContent = applyGroupedChanges(content, detectedChangeGroups, acceptedGroups)
    setContent(updatedContent)
    setShowDiffMode(false)
    setDetectedChangeGroups([])
    setAcceptedGroups([])
    setRejectedGroups([])
    setAiSuggestion('')
  }

  const handleDiscardChanges = () => {
    setShowDiffMode(false)
    setDetectedChangeGroups([])
    setAcceptedGroups([])
    setRejectedGroups([])
    setAiSuggestion('')
  }

  // Update the pending changes count to exclude spacing-only changes
  const pendingChangesCount = detectedChangeGroups.filter(group => 
    group.type !== 'unchanged' && 
    !acceptedGroups.includes(group.id) && 
    !rejectedGroups.includes(group.id) &&
    !isSpacingOnlyChange(group)
  ).length

  useEffect(() => {
    if (startWithAI && !content.trim()) {
      setShowAIPanel(true);
    }
  }, [startWithAI, content]);

  // Add a handler for PDF file updates
  const handlePdfFileUpdate = (newFile: File) => {
    // Mark that we now have a PDF file
    setHasPdfFile(true);
    
    // You could also update the contract data locally if needed
    toast({
      title: "PDF Updated",
      description: "The contract PDF has been updated successfully.",
      variant: "success",
    });
  };

  // ✅ CHANGE Line 531-533: Load existing positions
  useEffect(() => {
    if (contract.signaturePositions) {  // ← Changed from allowlistId
      try {
        const positions = JSON.parse(contract.signaturePositions) as SignaturePosition[];
        setSignaturePositions(positions);
      } catch (error) {
        console.error('Failed to parse signature positions:', error);
        setSignaturePositions([]);
      }
    }
  }, [contract.signaturePositions]);  // ← Changed from allowlistId

  // ✅ ADD: New state to track wallet-to-email mapping
  const [walletEmailMap, setWalletEmailMap] = useState<Map<string, string>>(new Map());

  // ✅ MODIFY: Update the generateActualSignerWallets function
  useEffect(() => {
    const generateActualSignerWallets = async () => {
      if (!user?.googleId) {
        console.log('[ContractEditor] No user Google ID, skipping wallet generation');
        setSignerWallets([]);
        setWalletEmailMap(new Map());
        return;
      }

      try {
        console.log('[ContractEditor] Generating actual signer wallets that match allowlist...');
        
        // **STEP 1: Get decrypted signer emails**
        let actualSignerEmails = signers;
        
        // Check if emails are encrypted and decrypt them if user is owner
        if (signers.length > 0 && areEmailsEncrypted(signers)) {
          console.log('[ContractEditor] Signers appear to be encrypted, attempting to decrypt...');
          
          try {
            const canDecrypt = await canDecryptEmails(contract.ownerGoogleIdHash, user.googleId);
            if (canDecrypt) {
              actualSignerEmails = await decryptSignerEmails(signers, user.googleId);
              console.log('[ContractEditor] Successfully decrypted signer emails:', actualSignerEmails);
            } else {
              console.warn('[ContractEditor] User cannot decrypt emails - not the owner');
              setSignerWallets([]);
              setWalletEmailMap(new Map());
              return;
            }
          } catch (decryptError) {
            console.error('[ContractEditor] Failed to decrypt signer emails:', decryptError);
            setSignerWallets([]);
            setWalletEmailMap(new Map());
            return;
          }
        }

        // **STEP 2: Create wallet-to-email mapping**
        const newWalletEmailMap = new Map<string, string>();

        if (actualSignerEmails.length === 0) {
          console.log('[ContractEditor] No signer emails available');
          setSignerWallets([]);
          setWalletEmailMap(newWalletEmailMap);
          return;
        }

        // **STEP 3: Generate predetermined wallets for each signer (same as allowlist creation)**
        console.log('[ContractEditor] Generating predetermined wallets for', actualSignerEmails.length, 'signers...');
        
        const signerWalletPromises = actualSignerEmails.map(async (email) => {
          try {
            // Hash the email using the same method as allowlist creation
            const hashedEmail = await hashGoogleId(`email_${email}`);
            console.log(`[ContractEditor] Hashed email for predetermined wallet: ${email.substring(0, 5)}...`);
            
            // Call the predetermined wallet API to get the actual wallet address
            const response = await fetch('/api/contracts/predetermined-wallet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                emailHash: hashedEmail,
                contractId: contract.id,
                context: 'signature-position-editor'
              }),
            });

            if (!response.ok) {
              throw new Error(`Predetermined wallet API failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`[ContractEditor] Generated predetermined wallet for ${email.substring(0, 5)}...:`, result.predeterminedAddress.substring(0, 8) + '...');
            
            return {
              email,
              wallet: result.predeterminedAddress
            };
          } catch (error) {
            console.error(`[ContractEditor] Failed to generate predetermined wallet for ${email}:`, error);
            return null;
          }
        });

        const signerWalletResults = await Promise.all(signerWalletPromises);
        const validSignerWallets = signerWalletResults.filter(result => result !== null);

        // **STEP 4: Get owner's contract-specific wallet**
        let ownerWallet: string | null = null;
        try {
          console.log('[ContractEditor] Getting owner contract-specific wallet...');
          
          // Get the owner's contract-specific wallet address
          const { getContractSpecificAddress } = await import('@/app/utils/contractWallet');
          const hashedOwnerGoogleId = await hashGoogleId(user.googleId);
          
          // Get JWT from session
          const sessionData = localStorage.getItem("epochone_session");
          if (sessionData) {
            const sessionObj = JSON.parse(sessionData);
            const jwt = sessionObj.zkLoginState?.jwt || sessionObj.user?.zkLoginState?.jwt;
            
            if (jwt) {
              ownerWallet = await getContractSpecificAddress(hashedOwnerGoogleId, contract.id, jwt);
              console.log('[ContractEditor] Owner contract-specific wallet:', ownerWallet.substring(0, 8) + '...');
            }
          }
        } catch (ownerWalletError) {
          console.error('[ContractEditor] Failed to get owner contract-specific wallet:', ownerWalletError);
        }

        // **STEP 5: Build wallet-to-email mapping**
        if (ownerWallet && user.email) {
          newWalletEmailMap.set(ownerWallet, user.email);
        }
        
        validSignerWallets.forEach(result => {
          if (result) {
            newWalletEmailMap.set(result.wallet, result.email);
          }
        });

        // **STEP 6: Combine all wallets (owner + signers)**
        const allWallets = [
          ...(ownerWallet ? [ownerWallet] : []),
          ...validSignerWallets.map(result => result!.wallet)
        ];

        console.log('[ContractEditor] Generated wallets for signature positions:', {
          ownerWallet: ownerWallet ? ownerWallet.substring(0, 8) + '...' : 'none',
          ownerEmail: user.email,
          signerWallets: validSignerWallets.map(r => r!.wallet.substring(0, 8) + '...'),
          signerEmails: validSignerWallets.map(r => r!.email),
          totalWallets: allWallets.length,
          emailMapping: Array.from(newWalletEmailMap.entries()).map(([wallet, email]) => ({
            wallet: wallet.substring(0, 8) + '...',
            email
          }))
        });

        setSignerWallets(allWallets);
        setWalletEmailMap(newWalletEmailMap);

      } catch (error) {
        console.error('[ContractEditor] Failed to generate actual signer wallets:', error);
        setSignerWallets([]);
        setWalletEmailMap(new Map());
      }
    };
    
    generateActualSignerWallets();
  }, [signers, contract.id, contract.ownerGoogleIdHash, user?.googleId, user?.email]);

  // ✅ ENHANCED: Handle signature position changes with debugging
  const handleSignaturePositionsChange = (positions: SignaturePosition[]) => {
    console.log('[ContractEditor] DEBUG - Signature positions changed:', {
      newPositionsCount: positions.length,
      positions: positions,
      previousCount: signaturePositions.length
    });
    
    setSignaturePositions(positions);
    // Mark contract as modified
    setHasChanges(true);
  };

  // ✅ ADD: Computed value for whether emails are decrypted
  const hasDecryptedEmails = signersDecrypted && decryptedSigners.length > 0;

  // ContractEditor.tsx - Add debugging to modifyAndEncryptPDF
  const modifyAndEncryptPDF = async (
    signaturePositions: SignaturePosition[], 
    walletEmailMap: Map<string, string>
  ): Promise<Uint8Array> => {
    console.log('[ContractEditor] 🔍 modifyAndEncryptPDF called with:', {
      signaturePositionsCount: signaturePositions.length,
      walletEmailMapSize: walletEmailMap.size,
      decryptedPdfBlobExists: !!decryptedPdfBlob,
      decryptedPdfBlobSize: decryptedPdfBlob?.size || 'null',
      decryptedPdfBlobType: typeof decryptedPdfBlob
    });

    // ✅ CRITICAL: Add null check with helpful error
    if (!decryptedPdfBlob) {
      console.error('[ContractEditor] CRITICAL ERROR: decryptedPdfBlob is null!', {
        blobState: decryptedPdfBlob,
        blobType: typeof decryptedPdfBlob,
        contractId: contract.id,
        hasPDF: !!contract.s3FileKey,
        isEncrypted: !!contract.sealAllowlistId
      });
      throw new Error('No decrypted PDF blob available. The PDF must be decrypted and displayed before modification. Check PDFEditor callback.');
    }

    console.log('[ContractEditor] ✅ decryptedPdfBlob is valid, proceeding with modification');

    // 1. Get decrypted PDF
    const decryptedPdfBytes = new Uint8Array(await decryptedPdfBlob.arrayBuffer());
    
    console.log('[ContractEditor] ✅ Converted blob to bytes:', {
      bytesLength: decryptedPdfBytes.length,
      firstFewBytes: Array.from(decryptedPdfBytes.slice(0, 10))
    });
    
    // 2. Add signature boxes
    const { addSignatureBoxesToPDF } = await import('@/app/utils/pdfSignatureBoxes');
    const modifiedPdfBytes = await addSignatureBoxesToPDF(
      decryptedPdfBytes,
      signaturePositions,
      walletEmailMap
    );
    
    // 3. Re-encrypt (just return bytes, don't upload)
    const { reEncryptPDF } = await import('@/app/utils/pdfReEncryption');
    const encryptedBytes = await reEncryptPDF({
      pdfBytes: modifiedPdfBytes,
      encryptionMetadata: {
        allowlistId: contract.sealAllowlistId,
        documentId: contract.sealDocumentId,
        capId: contract.sealCapId
      }
    });
    
    return encryptedBytes; // ✅ Just return, don't upload
  };

  // ContractEditor.tsx - Fix uploadEncryptedPDFToAWS function
  const uploadEncryptedPDFToAWS = async (encryptedBytes: Uint8Array) => {
    console.log('[ContractEditor] 📤 Uploading encrypted PDF to AWS');

    const formData = new FormData();
    formData.append('file', new Blob([await decryptedPdfBlob!.arrayBuffer()], { type: 'application/pdf' }));
    formData.append('contractId', contract.id);
    formData.append('encryptedBytes', Buffer.from(encryptedBytes).toString('base64'));
    formData.append('allowlistId', contract.sealAllowlistId!);
    formData.append('documentId', contract.sealDocumentId!);
    formData.append('capId', contract.sealCapId!);
    formData.append('isEncrypted', 'true');
    formData.append('replaceExisting', 'true');

    console.log('[ContractEditor] 📋 FormData prepared, making request...');

    const response = await fetch('/api/contracts/upload-pdf', {
      method: 'POST',
      body: formData,
    });

    console.log('[ContractEditor] 📡 Upload response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ContractEditor] ❌ Upload failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        contractId: contract.id
      });
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    
    console.log('[ContractEditor] ✅ Raw upload API response:', {
      contractId: contract.id,
      result,
      resultKeys: Object.keys(result),
      contractInResult: result.contract,
      directKeys: {
        s3FileKey: result.s3FileKey,
        s3FileName: result.s3FileName,
        s3FileSize: result.s3FileSize
      }
    });

    // ✅ CRITICAL: Verify the response has the data we need
    const returnData = {
      s3FileKey: result.contract?.s3FileKey || result.s3FileKey,
      s3FileName: result.contract?.s3FileName || result.s3FileName, 
      s3FileSize: result.contract?.s3FileSize || result.s3FileSize
    };

    console.log('[ContractEditor] 🔍 Extracted upload result:', {
      contractId: contract.id,
      returnData,
      hasS3FileKey: !!returnData.s3FileKey,
      hasS3FileName: !!returnData.s3FileName,
      hasS3FileSize: !!returnData.s3FileSize
    });

    // ✅ VALIDATION: Ensure we got valid data
    if (!returnData.s3FileKey) {
      console.error('[ContractEditor] ❌ Upload API returned no S3 file key!', {
        contractId: contract.id,
        fullResult: result
      });
      throw new Error('Upload API did not return S3 file key');
    }

    return returnData;
  };

  // ContractEditor.tsx - Add debugging to the callback handler
  const handleDecryptedPdfChange = (blob: Blob | null) => {
    console.log('[ContractEditor] 📞 RECEIVED decrypted PDF blob callback:', {
      hadPreviousBlob: !!decryptedPdfBlob,
      newBlobSize: blob?.size || 'null',
      timestamp: new Date().toISOString(),
      callStack: new Error().stack?.split('\n').slice(1, 4) // Show where this was called from
    });
    
    setDecryptedPdfBlob(blob);
    
    console.log('[ContractEditor] ✅ Updated decryptedPdfBlob state to:', {
      isNull: blob === null,
      size: blob?.size
    });
  };

  // ContractEditor.tsx - Add effect to monitor decryptedPdfBlob changes
  useEffect(() => {
    console.log('[ContractEditor] 🗂️ BLOB STATE MONITOR:', {
      hasBlob: !!decryptedPdfBlob,
      blobSize: decryptedPdfBlob?.size,
      timestamp: new Date().toISOString(),
      contractId: contract.id
    });
  }, [decryptedPdfBlob]);

  return (
    <Card className="w-full h-full border-none shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl font-semibold">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-semibold border-none p-0 h-auto focus-visible:ring-0"
                  placeholder="Contract Title"
                />
              </CardTitle>
              <CardDescription>
                <Input
                  value={description || ''}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm text-gray-500 border-none p-0 h-auto focus-visible:ring-0"
                  placeholder="Contract Description"
                />
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="edit">
          <TabsList className="mb-4">
            <TabsTrigger value="edit">Edit Content</TabsTrigger>
            <TabsTrigger value="signers">Signers</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="min-h-[500px] relative">
            {/* Conditional rendering based on whether contract has PDF */}
            {hasPdfFile ? (
              // Show PDF Editor when PDF exists
              <div className="space-y-6">
                <PDFEditor
                  contract={contract}
                  signatureMode="edit"
                  signerWallets={signerWallets}
                  walletEmailMap={walletEmailMap} // ✅ ADD: Pass email mapping
                  onPositionsChange={handleSignaturePositionsChange} // ✅ Make sure this is passed
                   // ✅ ADD: Pass loaded positions
                  onDecryptedPdfChange={handleDecryptedPdfChange} // ✅ Use debug version
                  showAIButton={false}
                  onFileUpdate={handlePdfFileUpdate}
                />
              </div>
            ) : (
              // Show existing text editor when no PDF
            <div className="border rounded-md min-h-[500px] bg-white relative overflow-hidden">
              {/* Header - Mobile Responsive */}
              <div className="p-3 md:p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
                {/* Text container with consistent sizing */}
                <div className="text-sm text-gray-500">
                  {showDiffMode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm">AI Suggestions</span>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {acceptedGroups.length} accepted
                      </span>
                      {pendingChangesCount > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                          {pendingChangesCount} pending
                        </span>
                      )}
                    </div>
                  ) : showAIPanel ? (
                    // Clickable version - same styling as static version
                    <button
                      onClick={() => setShowAIPanel(false)}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors group"
                    >
                      <ChevronLeft className="h-3 w-3 group-hover:translate-x-[-1px] transition-transform flex-shrink-0" />
                      <span className="font-normal">Contract Editor</span>
                    </button>
                  ) : (
                    // Static version with invisible spacer
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <div className="w-3 h-3 flex-shrink-0"></div>
                        <span className="font-normal">Text Editor</span>
                    </div>
                  )}
                </div>
                
                {/* Always show the button - just disable when AI panel is open */}
                {!showDiffMode && (
                  <div className="relative group">
                    <div className={`absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg blur transition duration-200 ${
                      showAIPanel 
                        ? 'opacity-10' 
                        : 'opacity-25 group-hover:opacity-50'
                    }`}></div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`relative gap-2 w-full sm:w-auto transition-all duration-200 ${
                        showAIPanel 
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                          : 'bg-white hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        if (!showAIPanel) {
                          setShowAIPanel(true);
                        }
                      }}
                      disabled={isAIProcessing || showAIPanel}
                    >
                      <Sparkles className={`h-4 w-4 transition-colors ${
                        showAIPanel ? 'text-gray-300' : ''
                      }`} />
                      <span className="sm:inline">Edit with AI</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* Main Content Area - Mobile Responsive Height */}
              <div className={`relative ${showDiffMode ? 'h-[350px] sm:h-[420px]' : 'h-[400px] sm:h-[500px]'}`}>
                {/* Contract Editor with Diff Overlay */}
                <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                  showAIPanel && !showDiffMode
                    ? '-translate-x-full opacity-0' 
                    : 'translate-x-0 opacity-100'
                }`}>
                  <ContractEditorWithDiff
                    content={content}
                    changeGroups={detectedChangeGroups}
                    acceptedGroups={acceptedGroups}
                    rejectedGroups={rejectedGroups}
                    onAcceptGroup={handleAcceptGroup}
                    onRejectGroup={handleRejectGroup}
                    onContentChange={setContent}
                    showDiff={showDiffMode}
                  />
                </div>

                {/* AI Panel - Mobile Optimized */}
                {!showDiffMode && (
                  <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                    showAIPanel 
                      ? 'translate-x-0 opacity-100' 
                      : 'translate-x-full opacity-0'
                  }`}>
                    <div className="h-full bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex flex-col">
                      {/* Scrollable Content Area - Now includes everything scrollable */}
                      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-2">
                        <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
                          {/* AI Header - Now scrollable */}
                          <div className="text-center pt-3 pb-2">
                            <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-2">
                              <Brain className="h-4 w-4 text-white" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">AI Assistant</h3>
                            <p className="text-xs text-gray-600 max-w-sm mx-auto leading-tight px-2">
                              Describe how you'd like to improve your contract
                            </p>
                          </div>

                          {/* AI Input - Mobile Optimized */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              What would you like me to help you with?
                            </label>
                            <Textarea
                              value={aiQuery}
                              onChange={(e) => setAiQuery(e.target.value)}
                              placeholder="For example: 'Add a confidentiality clause' or 'Make the language more formal'..."
                              className="min-h-[70px] sm:min-h-[80px] resize-none border-2 border-purple-200 focus:border-purple-400 focus:ring-purple-400 rounded-lg text-sm"
                              disabled={isAIProcessing}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault()
                                  handleAIEdit()
                                }
                              }}
                            />
                          </div>

                          {/* Quick Suggestions - Mobile Grid */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              Quick Suggestions
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                              {aiSuggestions.map((suggestion, index) => (
                                <button
                                  key={index}
                                  onClick={() => setAiQuery(suggestion)}
                                  disabled={isAIProcessing}
                                  className="text-left p-3 sm:p-2.5 text-xs bg-white border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Fixed Action Buttons Footer - Only this stays fixed */}
                      <div className="flex-shrink-0 p-3 sm:p-4 pt-2 border-t border-purple-200 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
                        <div className="max-w-xl mx-auto">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
                            <div className="text-xs text-gray-500 text-center sm:text-left">
                              <span className="hidden sm:inline">Press Ctrl+Enter to submit</span>
                              <span className="sm:hidden">Tap Enhance to continue</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowAIPanel(false)
                                  setAiQuery('')
                                }}
                                disabled={isAIProcessing}
                                className="border-gray-300 flex-1 sm:flex-none"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleAIEdit}
                                disabled={!aiQuery.trim() || isAIProcessing}
                                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white min-w-[100px] flex-1 sm:flex-none"
                              >
                                {isAIProcessing ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    <span className="hidden sm:inline">Processing...</span>
                                    <span className="sm:hidden">...</span>
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-1" />
                                    Submit
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Diff Mode Action Bar - Mobile Optimized */}
              {showDiffMode && (
                <div className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-3 sm:p-4">
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 lg:gap-0">
                    {/* Left side - Bulk actions - Mobile Stack */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <span className="text-sm font-medium text-gray-700 text-center sm:text-left">Quick Actions:</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAcceptAllChanges}
                          className="text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300 flex-1 sm:flex-none"
                          disabled={pendingChangesCount === 0}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Accept All</span>
                          <span className="sm:hidden">Accept</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRejectAllChanges}
                          className="text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300 flex-1 sm:flex-none"
                          disabled={pendingChangesCount === 0}
                        >
                          <X className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Reject All</span>
                          <span className="sm:hidden">Reject</span>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Right side - Primary actions - Mobile Stack */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDiscardChanges}
                        className="border-gray-300 hover:bg-gray-50 flex-1 sm:flex-none"
                      >
                        <X className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Discard All Changes</span>
                        <span className="sm:hidden">Discard</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApplyChanges}
                        disabled={acceptedGroups.length === 0}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md min-w-[100px] sm:min-w-[140px] flex-1 sm:flex-none"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Apply {acceptedGroups.length} Change{acceptedGroups.length !== 1 ? 's' : ''}</span>
                        <span className="sm:hidden">Apply ({acceptedGroups.length})</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress indicator - Mobile Optimized */}
                  {(acceptedGroups.length > 0 || pendingChangesCount > 0) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
                        <span className="text-center sm:text-left">
                          Progress: {acceptedGroups.length} accepted, {pendingChangesCount} pending
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <div className="w-full sm:w-32 bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${(acceptedGroups.length / (acceptedGroups.length + pendingChangesCount)) * 100}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium whitespace-nowrap">
                            {Math.round((acceptedGroups.length / (acceptedGroups.length + pendingChangesCount)) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
          </TabsContent>
          <TabsContent value="signers" className="min-h-[500px]">
            <div className="border rounded-md p-6 min-h-[500px] bg-white">
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Contract Signers</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Email Requirements:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-700">
                        <li>Must be a valid email format (e.g., user@example.com)</li>
                        <li>Must contain an @ symbol and domain (.com, .org, etc.)</li>
                        <li>Cannot add your own email address</li>
                        <li>Each email can only be added once</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                {signers.map((signer, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-full">
                        <User className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 relative">
                        <Input
                          value={signer}
                          onChange={(e) => handleSignerChange(index, e.target.value)}
                          placeholder="Enter signer email (e.g., john@company.com)"
                          className={`${
                            signerErrors[index] 
                              ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                              : signer.trim() && !signerErrors[index] && !isValidatingEmail[index]
                              ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                              : ''
                          }`}
                        />
                        {isValidatingEmail[index] && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          handleRemoveSigner(index);
                          // Remove corresponding error and validation state
                          const newErrors = [...signerErrors];
                          const newValidating = [...isValidatingEmail];
                          newErrors.splice(index, 1);
                          newValidating.splice(index, 1);
                          setSignerErrors(newErrors);
                          setIsValidatingEmail(newValidating);
                        }}
                        disabled={signers.length === 1 && !signer.trim()}
                        className={signers.length === 1 && !signer.trim() ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400" />
                      </Button>
                    </div>
                    
                    {/* Fixed height validation message area */}
                    <div className="min-h-[2.5rem] ml-11"> {/* Fixed minimum height container */}
                      {signerErrors[index] ? (
                        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-md">
                          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{signerErrors[index]}</span>
                        </div>
                      ) : signer.trim() && !isValidatingEmail[index] ? (
                        <div className="flex items-center gap-2 text-sm text-green-600 py-2">
                          <Check className="h-4 w-4 flex-shrink-0" />
                          <span>Valid email address</span>
                        </div>
                      ) : null /* No spacer needed due to min-height */}
                    </div>
                  </div>
                ))}
                
                {/* Summary */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      Valid signers: <span className="font-medium text-gray-900">{getValidSignersCount()}</span>
                    </span>
                    {getValidSignersCount() === 0 && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        At least one signer required
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleAddSigner();
                      // Add empty error and validation state for new signer
                      setSignerErrors([...signerErrors, '']);
                      setIsValidatingEmail([...isValidatingEmail, false]);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Signer
                  </Button>
                  
                  {contract.status === 'DRAFT' && (
                    <Button 
                      onClick={async () => {
                        try {
                          // Final validation before sending
                          if (!areAllSignersValid()) {
                            toast({
                              title: "Validation Required",
                              description: "Please ensure all signer emails are valid before sending.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          const validSignersCount = getValidSignersCount();
                          if (validSignersCount === 0) {
                            toast({
                              title: "No Signers Added",
                              description: "Please add at least one valid signer email address.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // First save any changes
                          if (hasChanges) {
                            await handleSave();
                          }
                          
                          // Then update status to PENDING
                          const updatedContract = await updateContract(contract.id, {
                            status: 'PENDING'
                          });
                          
                          // Optimistically close the editor immediately to prevent double-clicking
                          onSave(updatedContract);
                          
                          // Send emails to signers in the background
                          const validSigners = signers
                            .filter((s, index) => s.trim() !== '' && !signerErrors[index])
                            .map(s => s.trim().toLowerCase());
                          
                          if (validSigners.length > 0) {
                            // Show immediate feedback
                            toast({
                              title: "Sending Contract",
                              description: `Preparing signing invitations for ${validSigners.length} recipient(s)...`,
                            });
                            
                            const emailResponse = await fetch('/api/email/send-contract', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                contractId: contract.id,
                                contractTitle: title,
                                ownerName: contract.owner.name || contract.owner.email,
                                signerEmails: validSigners,
                              }),
                            });
                            
                            const emailResult = await emailResponse.json();
                            
                            if (emailResponse.ok) {
                              // Check for partial failures
                              if (emailResult.partialFailure && emailResult.partialFailure.length > 0) {
                                toast({
                                  title: "Partially Sent",
                                  description: `Contract sent to ${validSigners.length - emailResult.partialFailure.length}/${validSigners.length} recipients. ${emailResult.partialFailure.length} email(s) failed.`,
                                  variant: "destructive",
                                });
                              } else {
                                toast({
                                  title: "Contract Sent Successfully",
                                  description: `Signing invitations sent to all ${validSigners.length} recipient(s).`,
                                  variant: "success",
                                });
                              }
                            } else {
                              toast({
                                title: "Email Warning",
                                description: "Contract status updated but some emails may not have been sent.",
                                variant: "destructive",
                              });
                            }
                          }
                          
                        } catch (error) {
                          console.error('Error sending contract:', error);
                          toast({
                            title: "Send Failed",
                            description: "Failed to send contract. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={!areAllSignersValid() || getValidSignersCount() === 0}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send for Signatures ({getValidSignersCount()})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between pt-4 border-t">
        <div className="text-sm text-gray-500">
          {hasChanges ? 'Unsaved changes' : 'No changes'}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || saveLoading}
            className={(!hasChanges || saveLoading) ? 'opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
          >
            {saveLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
} 