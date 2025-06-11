'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Search, ChevronDown, ArrowLeft, AlertCircle, Info, Check, Loader2, Trash2, User, Shield, ExternalLink, Download, UserCheck, Database, Copy, FileDown, Activity, Clock, FileEdit, Upload, X } from 'lucide-react';
import { getContracts, createContract, deleteContract } from '@/app/utils/contracts';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { validateSignerEmail } from '@/app/utils/email';
import { downloadRecoveryData, extractRecoveryData } from '@/app/utils/recoveryData'
import DecryptButton from '@/components/contracts/DecryptButton'

// Import our contract components
import ContractActions from '@/components/contracts/ContractActions';
import ContractDetails from '@/components/contracts/ContractDetails';
import ContractEditor from '@/components/contracts/ContractEditor';
import UserProfile from '@/components/UserProfile';

// Skeleton Loading Component
const DashboardSkeleton = () => {
  return (
    <div className="container mx-auto p-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-6 bg-gray-100 rounded-full w-12"></div>
        </div>
        
        {/* Profile skeleton */}
        <div className="flex items-center gap-2 px-2 ml-2">
          <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
          <div className="hidden sm:flex flex-col gap-1">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-3 bg-gray-100 rounded w-32"></div>
          </div>
          <div className="h-4 w-4 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* Main Content Card */}
      <Card className="border-gray-100">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-4 bg-gray-100 rounded w-48"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded w-32"></div>
        </CardHeader>
        
        <CardContent>
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
            <div className="relative flex-1">
              <div className="h-10 bg-gray-100 rounded"></div>
            </div>
            <div className="h-10 bg-gray-100 rounded w-full sm:w-[180px]"></div>
          </div>

          {/* Desktop Table Skeleton */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                  </TableHead>
                  <TableHead>
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                  </TableHead>
                  <TableHead>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                  </TableHead>
                  <TableHead>
                    <div className="h-4 bg-gray-200 rounded w-14"></div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 bg-gray-200 rounded"></div>
                        <div className="h-4 bg-gray-200 rounded w-32"></div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
                        <div className="h-4 bg-gray-200 rounded w-16"></div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="h-8 bg-gray-200 rounded w-8 ml-auto"></div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card Skeleton */}
          <div className="md:hidden space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-4 bg-gray-200 rounded flex-shrink-0"></div>
                      <div className="h-4 bg-gray-200 rounded w-40"></div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
                      <div className="h-3 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
                <div className="flex justify-between">
                  <div className="h-3 bg-gray-100 rounded w-16"></div>
                  <div className="h-3 bg-gray-100 rounded w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Define the interface for the dashboard page
interface ContractWithRelations {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata: { 
    signers?: string[],
    walrus?: {
      storage?: {
        blobId?: string;
        uploadType?: string;
        uploadedAt?: string;
      };
      encryption?: {
        capId?: string;
        method?: string;
        documentId?: string;
        allowlistId?: string;
      };
      authorizedWallets?: string[];
      lastUpdated?: string;
    }
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures: {
    id: string;
    status: string;
    signedAt: Date | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
}

// Add this component near the top of your file (after imports):
const BlockchainAddress = ({ 
  label, 
  address, 
  showFullOnHover = false,
  copyable = true,
  externalLink
}: {
  label: string;
  address: string;
  showFullOnHover?: boolean;
  copyable?: boolean;
  externalLink?: string;
}) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shortenAddress = (addr: string, start = 8, end = 8) => {
    if (addr.length <= start + end) return addr;
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  };

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600 min-w-[60px]">{label}:</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <span 
          className="text-sm font-medium text-gray-900 bg-white px-3 py-1 rounded border font-mono"
          title={showFullOnHover ? address : undefined}
        >
          {shortenAddress(address)}
        </span>
        {copyable && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-8 w-8 p-0"
            title="Copy address"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const startTime = performance.now();
  console.log(`[DASHBOARD:TIMING] Component function executing at ${Math.round(startTime)}ms`);
  
  const { isAuthenticated, isLoading, isAuthStateResolved, logout, user } = useZkLogin();
  console.log('[DASHBOARD] Auth state:', { 
    isAuthenticated, 
    isLoading, 
    isAuthStateResolved, 
    hasUser: !!user,
    timestamp: Date.now(),
    sinceStart: `${Math.round(performance.now() - startTime)}ms`
  });
  
  // Add a ref to track component mounting time and render count
  const mountTimeRef = useRef(performance.now());
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  
  console.log(`[DASHBOARD] Render #${renderCountRef.current}`, {
    timeSincePageLoad: Math.round(performance.now())
  });
  
  const [contracts, setContracts] = useState<ContractWithRelations[]>([]);
  const [isCreatingContract, setIsCreatingContract] = useState(false);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [newContract, setNewContract] = useState({
    title: '',
    description: '',
    content: '',
    signers: [''],
  });
  
  // New states for contract management
  const [selectedContract, setSelectedContract] = useState<ContractWithRelations | null>(null);
  const [isViewingContract, setIsViewingContract] = useState(false);
  const [isEditingContract, setIsEditingContract] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedContractTab, setSelectedContractTab] = useState<string>("content");

  // Add state to track if we're creating a contract
  const [isCreatingInProgress, setIsCreatingInProgress] = useState(false);

  // Add validation states for contract creation
  const [newContractSignerErrors, setNewContractSignerErrors] = useState<string[]>(['']);
  const [isValidatingNewContractEmails, setIsValidatingNewContractEmails] = useState<boolean[]>([false]);

  // Add a new state for the blockchain details modal (around line 240):
  const [blockchainDetailsContract, setBlockchainDetailsContract] = useState<ContractWithRelations | null>(null);

  // Add this near your other state declarations (around line 220):
  const validationTimeoutRefs = useRef<(NodeJS.Timeout | null)[]>([]);

  // Add a new state to track if this is a newly created contract (around line 220):
  const [isNewlyCreatedContract, setIsNewlyCreatedContract] = useState(false);

  // Add a new state variable for dialog visibility (around line 290 with other states):
  const [isBlockchainDetailsOpen, setIsBlockchainDetailsOpen] = useState(false);

  // Add new state for PDF upload (around line 220 with other states):
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  // Add scroll ref for the dialog content
  const dialogScrollRef = useRef<HTMLDivElement>(null);

  // Add a new state to store the uploaded file data temporarily
  const [uploadedFileData, setUploadedFileData] = useState<{
    blob: Blob;
    fileName: string;
  } | null>(null);

  // Auto-scroll to bottom when signers are added
  useEffect(() => {
    if (dialogScrollRef.current && isCreatingContract) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        if (dialogScrollRef.current) {
          dialogScrollRef.current.scrollTop = dialogScrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [newContract.signers.length, selectedPdfFile, isCreatingContract]); // Added selectedPdfFile to dependencies

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user?.displayName) return 'U';
    const names = user.displayName.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };
  
  // Helper function to check if current user is a signer (not owner) of a contract
  const isUserASignerNotOwner = (contract: ContractWithRelations): boolean => {
    const isOwner = contract.ownerId === user?.id || contract.owner?.email === user?.email;
    const isSigner = contract.metadata?.signers?.includes(user?.email || '');
    return isSigner && !isOwner;
  };

  // Helper function to check if current user has signed the contract
  const hasUserSigned = (contract: ContractWithRelations): boolean => {
    return contract.signatures?.some(sig => 
      (sig.user?.email === user?.email || sig.user?.id === user?.id) && 
      sig.status === 'SIGNED'
    ) || false;
  };

  // Helper function to check if the owner has signed
  const hasOwnerSigned = (contract: ContractWithRelations): boolean => {
    return contract.signatures?.some(sig => 
      (sig.user?.email === contract.owner?.email || sig.user?.id === contract.ownerId) && 
      sig.status === 'SIGNED'
    ) || false;
  };

  // Helper function to check if anyone (excluding owner) has signed
  const hasAnyoneSigned = (contract: ContractWithRelations): boolean => {
    return contract.signatures?.some(sig => 
      sig.status === 'SIGNED' && 
      sig.user?.email !== contract.owner?.email && 
      sig.user?.id !== contract.ownerId
    ) || false;
  };

  // Helper function to check if current user is the owner
  const isUserOwner = (contract: ContractWithRelations): boolean => {
    return contract.ownerId === user?.id || contract.owner?.email === user?.email;
  };

  // Helper function to get display status for contracts
  const getDisplayStatus = (contract: ContractWithRelations): string => {
    // Add debugging
    console.log(`[DEBUG] getDisplayStatus for contract ${contract.id}:`, {
      contractId: contract.id,
      status: contract.status,
      isUserOwner: isUserOwner(contract),
      isUserASignerNotOwner: isUserASignerNotOwner(contract),
      hasAnyoneSigned: hasAnyoneSigned(contract),
      hasOwnerSigned: hasOwnerSigned(contract),
      signatures: contract.signatures,
      ownerId: contract.ownerId,
      ownerEmail: contract.owner?.email,
      currentUserEmail: user?.email,
      currentUserId: user?.id
    });

    // If user is a signer (not owner)
    if (isUserASignerNotOwner(contract)) {
      if (contract.status === 'PENDING') {
        // If they've already signed, show as "Active"
        if (hasUserSigned(contract)) {
          console.log(`[DEBUG] Returning "Active" for signer who signed`);
          return 'Active';
        }
        // If they haven't signed, show "Awaiting Signature"
        console.log(`[DEBUG] Returning "Awaiting Signature" for signer who hasn't signed`);
        return 'Awaiting Signature';
      }
      // For completed contracts, show "Completed"
      if (contract.status === 'COMPLETED') {
        console.log(`[DEBUG] Returning "Completed" for signer`);
        return 'Completed';
      }
    }
    
    // For owners
    if (isUserOwner(contract)) {
      console.log(`[DEBUG] User is owner, checking status...`);
      if (contract.status === 'DRAFT') {
        console.log(`[DEBUG] Returning "Draft" for owner`);
        return 'Draft';
      }
      // Handle both PENDING and ACTIVE statuses the same way
      if (contract.status === 'PENDING' || contract.status === 'ACTIVE') {
        console.log(`[DEBUG] Contract is PENDING or ACTIVE, checking signatures...`);
        // If someone signed and owner hasn't signed yet
        if (hasAnyoneSigned(contract) && !hasOwnerSigned(contract)) {
          console.log(`[DEBUG] Someone signed and owner hasn't - returning "Ready for Your Signature"`);
          return 'Ready for Your Signature';
        }
        // If owner has signed or no one has signed yet
        console.log(`[DEBUG] Returning "Pending" for owner`);
        return 'Pending';
      }
      if (contract.status === 'COMPLETED') {
        console.log(`[DEBUG] Returning "Completed" for owner`);
        return 'Completed';
      }
    }
    
    // Fallback: capitalize first letter
    const fallback = contract.status.charAt(0) + contract.status.slice(1).toLowerCase();
    console.log(`[DEBUG] Returning fallback status: ${fallback}`);
    return fallback;
  };

  // Helper function to get status color based on display status
  const getStatusColor = (contract: ContractWithRelations): string => {
    const displayStatus = getDisplayStatus(contract);
    
    // Color mapping based on display status
    switch (displayStatus) {
      case 'Draft':
        return 'bg-blue-500';
      case 'Pending':
        return 'bg-yellow-500';
      case 'Ready for Your Signature':
        return 'bg-green-500';
      case 'Awaiting Signature':
        return 'bg-orange-500';
      case 'Active':
        return 'bg-green-500';
      case 'Completed':
        return 'bg-purple-500';
      case 'Expired':
        return 'bg-gray-500';
      case 'Cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  const loadContracts = useCallback(async () => {
    if (!user?.email) return;
    try {
      console.log('[DASHBOARD] Starting contract data fetch for user:', user.email);
      setIsLoadingContracts(true);
      const data = await getContracts(user.email);
      console.log('[DASHBOARD] Contract data received:', data);
      
      // Log details of COMPLETED contracts to check metadata
      const completedContracts = data.filter(c => c.status === 'COMPLETED');
      console.log('[DASHBOARD] COMPLETED contracts:', completedContracts);
      completedContracts.forEach((contract, index) => {
        console.log(`[DASHBOARD] COMPLETED contract #${index+1}:`, {
          id: contract.id,
          title: contract.title,
          metadata: contract.metadata,
          walrusData: contract.metadata?.walrus,
          blobId: contract.metadata?.walrus?.storage?.blobId,
          documentId: contract.metadata?.walrus?.encryption?.documentId,
          allowlistId: contract.metadata?.walrus?.encryption?.allowlistId
        });
      });
      
      setContracts(data as unknown as ContractWithRelations[]);
      console.log('[DASHBOARD] Contract data loaded successfully and set to state');
    } catch (error) {
      console.error('[DASHBOARD] Error loading contracts:', error);
    } finally {
      setIsLoadingContracts(false);
      console.log('[DASHBOARD] Contract loading complete');
    }
  }, [user?.email]);

  // Load actual contracts
  useEffect(() => {
    const mountedAt = performance.now();
    console.log('[DASHBOARD] Component mounted', {
      isAuthenticated, 
      isLoading,
      isAuthStateResolved,
      timeSinceRender: Math.round(mountedAt - mountTimeRef.current),
      timeSincePageLoad: Math.round(mountedAt)
    });
    
    if (isAuthenticated && user?.email) {
      console.log('[DASHBOARD] Loading contracts', {
        timestamp: Date.now()
      });
      loadContracts();
    } else if (isAuthStateResolved && !isAuthenticated) {
      // If we're not authenticated and auth state is resolved, 
      // no need to wait for contracts
      setIsLoadingContracts(false);
    }
    
    return () => {
      console.log('[DASHBOARD] Component unmounting', {
        isAuthenticated,
        isLoading,
        isAuthStateResolved,
        mountDuration: Math.round(performance.now() - mountTimeRef.current)
      });
    };
  }, [isAuthenticated, user?.email, loadContracts, isLoading, isAuthStateResolved]);
  
  // Replace the handleNewContractSignerChange function with this corrected version:
  const handleNewContractSignerChange = useCallback((index: number, value: string) => {
    // Convert email to lowercase automatically
    const lowercaseValue = value.toLowerCase();
    
    // Use functional state updates to avoid stale closure values
    setNewContract(currentContract => ({
      ...currentContract,
      signers: currentContract.signers.map((s, i) => i === index ? lowercaseValue : s)
    }));
    
    setNewContractSignerErrors(currentErrors => {
      const newErrors = [...currentErrors];
      newErrors[index] = ''; // Clear previous error
      return newErrors;
    });
    
    setIsValidatingNewContractEmails(currentValidating => {
      const newValidating = [...currentValidating];
      newValidating[index] = true;
      return newValidating;
    });
    
    // Clear any existing timeout for this index
    if (validationTimeoutRefs.current[index]) {
      clearTimeout(validationTimeoutRefs.current[index]!);
      validationTimeoutRefs.current[index] = null;
    }
    
    // Set up new validation timeout
    validationTimeoutRefs.current[index] = setTimeout(() => {
      const trimmedValue = lowercaseValue.trim();
      
      if (trimmedValue) {
        // Validate the email format
        const validation = validateSignerEmail(trimmedValue, user?.email);
        
        setNewContractSignerErrors(currentErrors => {
          const updatedErrors = [...currentErrors];
          
          if (!validation.isValid) {
            updatedErrors[index] = validation.error || 'Invalid email';
          } else {
            // Check for duplicates
            setNewContract(currentContract => {
              const duplicateIndex = currentContract.signers.findIndex((s, i) => 
                i !== index && s.trim().toLowerCase() === trimmedValue
              );
              
              if (duplicateIndex !== -1) {
                updatedErrors[index] = 'This email is already added';
              }
              
              return currentContract; // Don't actually update, just check
            });
          }
          
          return updatedErrors;
        });
      }
      
      // Mark validation as complete
      setIsValidatingNewContractEmails(currentValidating => {
        const updatedValidating = [...currentValidating];
        updatedValidating[index] = false;
        return updatedValidating;
      });
      
      // Clear the timeout ref
      validationTimeoutRefs.current[index] = null;
    }, 300);
  }, [user?.email]); // Remove the state dependencies that were causing stale closures

  // Also update the add/remove functions to use functional updates:
  const handleAddNewContractSigner = useCallback(() => {
    setNewContract(currentContract => ({
      ...currentContract,
      signers: [...currentContract.signers, '']
    }));
    
    setNewContractSignerErrors(currentErrors => [...currentErrors, '']);
    setIsValidatingNewContractEmails(currentValidating => [...currentValidating, false]);
    
    // Ensure timeout refs array has the right length
    validationTimeoutRefs.current.push(null);
  }, []);

  const handleRemoveNewContractSigner = useCallback((index: number) => {
    // Clear timeout for the removed signer
    if (validationTimeoutRefs.current[index]) {
      clearTimeout(validationTimeoutRefs.current[index]!);
    }
    
    setNewContract(currentContract => {
      const newSigners = [...currentContract.signers];
      newSigners.splice(index, 1);
      
      // Ensure at least one empty signer field
      if (newSigners.length === 0) {
        newSigners.push('');
      }
      
      return {
        ...currentContract,
        signers: newSigners
      };
    });
    
    setNewContractSignerErrors(currentErrors => {
      const newErrors = [...currentErrors];
      newErrors.splice(index, 1);
      if (newErrors.length === 0) {
        newErrors.push('');
      }
      return newErrors;
    });
    
    setIsValidatingNewContractEmails(currentValidating => {
      const newValidating = [...currentValidating];
      newValidating.splice(index, 1);
      if (newValidating.length === 0) {
        newValidating.push(false);
      }
      return newValidating;
    });
    
    validationTimeoutRefs.current.splice(index, 1);
    if (validationTimeoutRefs.current.length === 0) {
      validationTimeoutRefs.current.push(null);
    }
  }, []);

  // Add cleanup effect to clear timeouts when component unmounts or modal closes:
  useEffect(() => {
    return () => {
      // Clear all validation timeouts on cleanup
      validationTimeoutRefs.current.forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      validationTimeoutRefs.current = [];
    };
  }, []);

  // Add this effect to clear timeouts when the modal closes:
  useEffect(() => {
    if (!isCreatingContract) {
      // Clear all pending validations when modal closes
      validationTimeoutRefs.current.forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      validationTimeoutRefs.current = [];
    }
  }, [isCreatingContract]);

  // Helper to get valid signers count for contract creation
  const getNewContractValidSignersCount = () => {
    return newContract.signers.filter((s, index) => 
      s.trim() !== '' && !newContractSignerErrors[index]
    ).length;
  };

  // Helper to check if all new contract signers are valid
  const areNewContractSignersValid = () => {
    const nonEmptySigners = newContract.signers.filter(s => s.trim() !== '');
    return newContractSignerErrors.every(error => error === '') &&
           !isValidatingNewContractEmails.some(validating => validating);
  };

  // Add file upload handler
  const handlePdfFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF file.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a PDF file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedPdfFile(file);
      
      // Auto-populate title from filename (remove .pdf extension)
      if (!newContract.title.trim()) {
        const fileName = file.name.replace(/\.pdf$/i, '');
        setNewContract(prev => ({ ...prev, title: fileName }));
      }
    }
  };

  const handleRemovePdfFile = () => {
    setSelectedPdfFile(null);
  };

  // Update the handleUploadPdf function to store the file data
  const handleUploadPdf = async (contractId: string) => {
    if (!selectedPdfFile) return;
    
    setIsUploadingPdf(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedPdfFile);
      formData.append('contractId', contractId);
      
      const response = await fetch('/api/contracts/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const result = await response.json();
      
      // Store the uploaded file data for immediate use
      setUploadedFileData({
        blob: selectedPdfFile,
        fileName: selectedPdfFile.name
      });
      
      toast({
        title: "PDF Uploaded Successfully",
        description: `${selectedPdfFile.name} has been attached to the contract.`,
        variant: "success",
      });
      
      // Update the contract in local state
      handleUpdateContract(result.contract);
      
      return result;
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload PDF",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // Enhanced handleCreateContract with validation
  const handleCreateContract = async () => {
    // Prevent spam clicking
    if (isCreatingInProgress || !newContract.title.trim() || !newContract.description.trim() || !user?.email) return;
    
    // Validate signers before creating
    const hasValidationErrors = newContractSignerErrors.some(error => error !== '');
    if (hasValidationErrors) {
      toast({
        title: "Validation Error",
        description: "Please fix all email validation errors before creating the contract.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsCreatingInProgress(true);
      
      // Filter and validate signers
      const validSigners = newContract.signers
        .filter((s, index) => s.trim() !== '' && !newContractSignerErrors[index])
        .map(s => s.trim().toLowerCase());
      
      // Create a temporary contract object for optimistic UI
      const tempContract: ContractWithRelations = {
        id: 'temp-' + Date.now(), // Temporary ID
        title: newContract.title,
        description: newContract.description,
        content: newContract.content || '',
        status: 'DRAFT',
        ownerId: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
        metadata: {
          signers: validSigners,
        },
        owner: {
          id: user.id || user.email,
          name: user.displayName || null,
          email: user.email,
        },
        signatures: [],
      };

      // Store if PDF was selected before resetting form
      const hasPdfFile = !!selectedPdfFile;

      // Reset the form
      const resetForm = () => {
        setNewContract({ title: '', description: '', content: '', signers: [''] });
        setNewContractSignerErrors(['']);
        setIsValidatingNewContractEmails([false]);
        setSelectedPdfFile(null);
      };

      // Immediately close the creation modal
      setIsCreatingContract(false);
      resetForm();
      setSelectedContract(tempContract);
      
      // Choose the appropriate view based on whether PDF was uploaded
      if (hasPdfFile) {
        // For PDF contracts, go directly to viewer
        setIsViewingContract(true);
        setSelectedContractTab("content"); // Show the PDF content tab
      } else {
        // For text contracts, go to AI editor
        setIsNewlyCreatedContract(true);
        setIsEditingContract(true);
      }
      
      // Create the actual contract in the background
      const actualContract = await createContract({
        title: newContract.title,
        description: newContract.description,
        content: newContract.content || '',
        ownerId: user.email,
        metadata: {
          signers: validSigners,
        },
      });

      // If PDF file was selected, upload it
      if (hasPdfFile) {
        try {
          const uploadResult = await handleUploadPdf(actualContract.id);
          // Update with contract that includes PDF info
          setContracts([uploadResult.contract as unknown as ContractWithRelations, ...contracts]);
          setSelectedContract(uploadResult.contract as unknown as ContractWithRelations);
        } catch (uploadError) {
          // Contract was created but PDF upload failed
          console.error('PDF upload failed:', uploadError);
          setContracts([actualContract as unknown as ContractWithRelations, ...contracts]);
          setSelectedContract(actualContract as unknown as ContractWithRelations);
        }
      } else {
        // No PDF to upload
        setContracts([actualContract as unknown as ContractWithRelations, ...contracts]);
        setSelectedContract(actualContract as unknown as ContractWithRelations);
      }
      
      toast({
        title: "Contract Created",
        description: `Contract created with ${validSigners.length} signer(s).${hasPdfFile ? ' Opening PDF viewer...' : ' Opening AI editor...'}`,
        variant: "success",
      });
    
    } catch (error) {
      console.error('Error creating contract:', error);
      
      // Revert optimistic changes on error
      setIsEditingContract(false);
      setIsViewingContract(false);
      setSelectedContract(null);
      setIsCreatingContract(true); // Reopen the creation dialog
      
      toast({
        title: "Creation Failed",
        description: "Failed to create contract. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingInProgress(false);
    }
  };
  
  const handleConfirmDelete = (contractId: string) => {
    setContractToDelete(contractId);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteContract = async () => {
    if (!contractToDelete) return;
    
    // Store the contract to delete for potential restoration
    const contractToDeleteData = contracts.find(c => c.id === contractToDelete);
    if (!contractToDeleteData) return;
    
    try {
      // Optimistically remove the contract from UI immediately
      setContracts(contracts.filter(c => c.id !== contractToDelete));
      setDeleteDialogOpen(false);
      setContractToDelete(null);
      
      // Show optimistic feedback
      toast({
        title: "Contract deleted",
        description: `"${contractToDeleteData.title}" has been deleted.`,
        variant: "success",
      });
      
      // Perform the actual deletion in the background
      await deleteContract(contractToDelete);
      
    } catch (error) {
      console.error('Error deleting contract:', error);
      
      // Revert optimistic changes on error
      setContracts(prevContracts => {
        // Find the position where the contract should be restored
        // We'll add it back to maintain chronological order
        const sortedContracts = [...prevContracts, contractToDeleteData].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return sortedContracts;
      });
      
      // Show error message
      toast({
        title: "Error",
        description: "Failed to delete contract. Please try again.",
        variant: "destructive",
      });
      
      // Reset the delete state in case user wants to try again
      setContractToDelete(contractToDelete);
    }
  };
  
  const handleUpdateContract = (updatedContract: ContractWithRelations) => {
    setContracts(contracts.map(c => 
      c.id === updatedContract.id ? updatedContract : c
    ));
    setSelectedContract(updatedContract);
  };
  
  const handleViewContract = (contract: ContractWithRelations) => {
    setSelectedContract(contract);
    setSelectedContractTab("content");
    setIsViewingContract(true);
  };
  
  const handleEditContract = (contract: ContractWithRelations) => {
    setSelectedContract(contract);
    setIsNewlyCreatedContract(false);
    setIsEditingContract(true);
  };
  
  const handleSendContract = async (contract: ContractWithRelations) => {
    if (!contract.id) return;
    
    try {
      // Show loading state
      toast({
        title: "Sending contract...",
        description: "Preparing contract for signatures.",
      });
      
      // Update contract status to PENDING
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PENDING' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update contract status');
      }
      
      // Send emails to signers
      const metadata = contract.metadata as { signers?: string[] } | null;
      const signerEmails = metadata?.signers || [];
      
      if (signerEmails.length > 0) {
        try {
          const emailResponse = await fetch('/api/email/send-contract', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contractId: contract.id,
              contractTitle: contract.title,
              ownerName: contract.owner.name || contract.owner.email,
              signerEmails,
            }),
          });
          
          const emailResult = await emailResponse.json();
          
          if (!emailResponse.ok) {
            console.error('Email sending failed:', emailResult);
            // Don't fail the entire operation if email fails
      toast({
              title: "Contract sent with warning",
              description: "Contract status updated but some emails may not have been sent.",
              variant: "destructive",
            });
          } else {
            // Check for partial failures
            if (emailResult.partialFailure && emailResult.partialFailure.length > 0) {
              toast({
                title: "Contract sent with warnings",
                description: `Contract sent, but ${emailResult.partialFailure.length} email(s) failed to send.`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Contract sent successfully",
                description: `Signing invitations sent to ${signerEmails.length} recipient(s).`,
        variant: "success",
      });
            }
          }
        } catch (emailError) {
          console.error('Email service error:', emailError);
          toast({
            title: "Contract sent with warning",
            description: "Contract status updated but email notifications failed.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Contract status updated",
          description: "No signers specified for email notifications.",
          variant: "success",
        });
      }
      
      // Refresh contracts list
      loadContracts();
      
      // Open the contract details on the SIGNERS tab
      setSelectedContract(contract);
      setSelectedContractTab("signers");
      setIsViewingContract(true);
    } catch (error) {
      console.error('Error sending contract:', error);
      toast({
        title: "Error",
        description: "Failed to send contract. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredContracts = contracts.filter(contract => {
    let matches = true;
    
    // Exclude completed contracts since they have their own section
    if (contract.status === 'COMPLETED') {
      return false;
    }
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      matches = matches && (
        contract.title.toLowerCase().includes(searchLower) ||
        (contract.description?.toLowerCase().includes(searchLower) || false)
      );
    }
    
    if (statusFilter && statusFilter !== 'all') {
      matches = matches && contract.status === statusFilter;
    }
    
    return matches;
  });

  // Add these utility functions after your existing utility functions (around line 460):
  const getWalrusExplorerUrl = (blobId: string) => 
    `https://walruscan.com/testnet/blob/${blobId}`;

  const getSuiExplorerUrl = (objectId: string) => 
    `https://testnet.suivision.xyz/object/${objectId}`;

  const getCompletedContracts = () => 
    contracts.filter(contract => contract.status === 'COMPLETED');

  const handleViewBlockchainDetails = (contract: ContractWithRelations) => {
    setBlockchainDetailsContract(contract);
    setIsBlockchainDetailsOpen(true);
  };

  // Add a proper close handler that delays clearing the contract data:
  const handleCloseBlockchainDetails = () => {
    setIsBlockchainDetailsOpen(false);
    // Delay clearing the contract data to allow animation to complete
    setTimeout(() => {
      setBlockchainDetailsContract(null);
    }, 150); // Adjust timing to match your dialog animation duration
  };

  // Show loading state with skeleton
  if (isLoading || !isAuthStateResolved || (isAuthenticated && isLoadingContracts)) {
    console.log('[DASHBOARD] Rendering skeleton loading state', {
      isLoading,
      isAuthStateResolved,
      isLoadingContracts,
      isAuthenticated,
      timeSinceStart: Math.round(performance.now() - startTime)
    });
    
    return <DashboardSkeleton />;
  }

  // Show skeleton for non-authenticated users to prevent layout shift
  if (!isAuthenticated) {
    console.log('[DASHBOARD] User not authenticated, showing skeleton UI', {
      timeSinceStart: Math.round(performance.now() - startTime)
    });
    
    return <DashboardSkeleton />;
  }

  // Log when viewing contract details
  if (isViewingContract && selectedContract) {
    console.log('[DASHBOARD] Rendering contract details view');
    return (
      <div className="container mx-auto p-6">
        <ContractDetails 
          contract={selectedContract} 
          onBack={() => {
            setIsViewingContract(false);
            // Clear uploaded file data when leaving the view
            setUploadedFileData(null);
          }}
          onUpdate={handleUpdateContract}
          defaultTab={selectedContractTab}
          uploadedFileData={uploadedFileData} // Pass the uploaded file data
        />
      </div>
    );
  }

  // Log when editing contract
  if (isEditingContract && selectedContract) {
    console.log('[DASHBOARD] Rendering contract editor view');
    return (
      <div className="container mx-auto p-6">
        <ContractEditor 
          contract={selectedContract} 
          startWithAI={isNewlyCreatedContract}
          onSave={(updated) => {
            handleUpdateContract(updated);
            setIsEditingContract(false);
            setIsNewlyCreatedContract(false);
          }}
          onCancel={() => {
            setIsEditingContract(false);
            setIsNewlyCreatedContract(false);
          }}
        />
      </div>
    );
  }

  // Log main dashboard rendering
  console.log('[DASHBOARD] Rendering main dashboard view');
  return (
    <div className="container mx-auto p-6">
      {showProfile ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={() => setShowProfile(false)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
          <UserProfile />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 truncate">Contract Dashboard</h1>
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
              BETA ✨
              </span>
            </div>
            
            {/* Profile dropdown - always on the right */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-gray-100 ml-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profilePicture || ''} alt={user?.displayName || 'User'} />
                    <AvatarFallback className="bg-blue-600 text-white">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:flex flex-col items-start text-sm">
                    <span className="font-medium">{user?.displayName || 'User'}</span>
                    <span className="text-xs text-gray-500">{user?.email}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="sm:hidden px-2 py-1.5 border-b">
                  <p className="font-medium text-sm">{user?.displayName || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <DropdownMenuLabel className="hidden sm:block">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => setShowProfile(true)}
                >
                  <span>Profile</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-red-600">
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-6">
            <Card className="border-gray-100">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileEdit className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-gray-900">Contracts in Progress</CardTitle>
                    <CardDescription className="text-gray-600">
                      Manage and track your active contracts
                    </CardDescription>
                  </div>
                </div>
                <Dialog open={isCreatingContract} onOpenChange={(open) => {
                  setIsCreatingContract(open);
                  if (!open) {
                    // Reset form when dialog closes
                    setNewContract({ title: '', description: '', content: '', signers: [''] });
                    setNewContractSignerErrors(['']);
                    setIsValidatingNewContractEmails([false]);
                    setSelectedPdfFile(null);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      New Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                      <DialogTitle className="text-gray-900">Create New Contract</DialogTitle>
                      <DialogDescription className="text-gray-600">
                        Fill in the details below to create a new contract.
                      </DialogDescription>
                    </DialogHeader>
                    
                    {/* Scrollable Content Area with ref */}
                    <div 
                      ref={dialogScrollRef}
                      className="flex-1 overflow-y-auto min-h-0 scroll-smooth"
                    >
                      <div className="grid gap-6 py-4 px-1">
                        {/* Compact PDF Upload Button at the top */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3">
                            <Upload className="h-4 w-4 text-gray-600" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {selectedPdfFile ? selectedPdfFile.name : 'Upload Contract PDF'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {selectedPdfFile 
                                  ? `${(selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB • PDF Document`
                                  : 'Optional • Max 10MB • PDF only'
                                }
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {selectedPdfFile && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRemovePdfFile}
                                className="text-gray-400 hover:text-red-600 h-8 w-8 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handlePdfFileSelect}
                              className="hidden"
                              id="pdf-upload-compact"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById('pdf-upload-compact')?.click()}
                              className="text-xs"
                            >
                              {selectedPdfFile ? 'Change' : 'Browse'}
                            </Button>
                          </div>
                        </div>

                        {/* Auto-populate title from PDF filename */}
                        <div className="grid gap-2">
                          <label htmlFor="title" className="text-sm font-medium text-gray-900">
                            Title
                          </label>
                          <Input
                            id="title"
                            value={newContract.title}
                            onChange={(e) => setNewContract({ ...newContract, title: e.target.value })}
                            placeholder="Contract title"
                            className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label htmlFor="description" className="text-sm font-medium text-gray-900">
                            Description
                          </label>
                          <Input
                            id="description"
                            value={newContract.description}
                            onChange={(e) => setNewContract({ ...newContract, description: e.target.value })}
                            placeholder="Contract description"
                            className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        
                        {/* Enhanced Signers Section */}
                        <div className="grid gap-4">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-900">Signers</label>
                            <span className="text-xs text-gray-500">
                              Valid: {getNewContractValidSignersCount()}
                            </span>
                          </div>
                          
                          {/* Info panel */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-blue-800">
                                <p className="font-medium mb-1">Email Requirements:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                                  <li>Valid email format (e.g., user@example.com)</li>
                                  <li>Cannot add your own email address</li>
                                  <li>Each email can only be added once</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                          
                          {/* Signers list */}
                          <div className="space-y-3">
                            {newContract.signers.map((signer, index) => (
                              <div key={index} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-blue-50 rounded-full">
                                    <User className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div className="flex-1 relative">
                                    <Input
                                      value={signer}
                                      onChange={(e) => handleNewContractSignerChange(index, e.target.value)}
                                      placeholder="Enter signer email (e.g., john@company.com)"
                                      className={`text-sm ${
                                        newContractSignerErrors[index] 
                                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                                          : signer.trim() && !newContractSignerErrors[index] && !isValidatingNewContractEmails[index]
                                          ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                                          : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500'
                                      }`}
                                    />
                                    {isValidatingNewContractEmails[index] && (
                                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Add/Remove buttons */}
                                  {index === newContract.signers.length - 1 ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={handleAddNewContractSigner}
                                      className="border-gray-200 hover:bg-blue-50 px-2 py-1 h-8"
                                    >
                                      <Plus className="h-3 w-3 text-blue-600" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveNewContractSigner(index)}
                                      className="px-2 py-1 h-8"
                                    >
                                      <Trash2 className="h-3 w-3 text-gray-400" />
                                    </Button>
                                  )}
                                </div>
                                
                                {/* Fixed height validation message area */}
                                <div className="h-8 ml-6"> {/* Fixed height container */}
                                  {newContractSignerErrors[index] ? (
                                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-md h-full">
                                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{newContractSignerErrors[index]}</span>
                                    </div>
                                  ) : signer.trim() && !isValidatingNewContractEmails[index] ? (
                                    <div className="flex items-center gap-2 text-xs text-green-600 h-full">
                                      <Check className="h-3 w-3 flex-shrink-0" />
                                      <span>Valid email address</span>
                                    </div>
                                  ) : (
                                    <div className="h-full"></div> /* Empty spacer to maintain height */
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Fixed Footer */}
                    <DialogFooter className="flex-shrink-0 border-t border-gray-200 pt-4 mt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setIsCreatingContract(false)} 
                        className="border-gray-200 hover:bg-blue-50"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCreateContract} 
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={
                          isCreatingInProgress || 
                          !newContract.title.trim() || 
                          !newContract.description.trim() ||
                          !areNewContractSignersValid() ||
                          newContractSignerErrors.some(error => error !== '')
                        }
                      >
                        {isCreatingInProgress ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>Create Contract ({getNewContractValidSignersCount()} signers)</>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                {/* Search and Filter - Improved mobile layout */}
                <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search contracts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] border-gray-200">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="SIGNED">Signed</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Desktop Table - hide on mobile */}
                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-gray-50">
                        <TableHead className="text-gray-900 w-[25%]">Title</TableHead>
                        <TableHead className="text-gray-900 w-[25%] min-w-[180px]">Status</TableHead>
                        <TableHead className="text-gray-900 w-[20%]">Created</TableHead>
                        <TableHead className="text-gray-900 w-[15%]">Signers</TableHead>
                        <TableHead className="text-right text-gray-900 w-[15%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContracts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                            No contracts found. Create your first contract by clicking the "New Contract" button.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredContracts.map((contract) => (
                          <TableRow key={contract.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium text-gray-900 w-[25%]">
                              <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleViewContract(contract)}>
                                <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                <span className="truncate">{contract.title}</span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[25%] min-w-[180px]">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(contract)}`}></span>
                                <span className="text-sm font-medium truncate">{getDisplayStatus(contract)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-gray-600 w-[20%]">
                              <span className="text-sm">{format(new Date(contract.createdAt), 'MMM dd, yyyy')}</span>
                            </TableCell>
                            <TableCell className="w-[15%]">
                              <div className="flex items-center">
                                <span className="text-sm">{contract.metadata?.signers?.length || 0} signers</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right w-[15%]">
                              <ContractActions 
                                contractId={contract.id}
                                status={contract.status}
                                contract={contract}
                                onView={() => handleViewContract(contract)}
                                onEdit={() => handleEditContract(contract)}
                                onDelete={() => handleConfirmDelete(contract.id)}
                                onSend={() => handleSendContract(contract)}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards - show on mobile and tablet */}
                <div className="lg:hidden">
                  {filteredContracts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                      <p className="text-lg font-medium">No contracts found</p>
                      <p className="text-sm">
                        {searchTerm || statusFilter !== 'all' 
                          ? 'Try adjusting your search or filter criteria' 
                          : 'Create your first contract to get started'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredContracts.map((contract) => (
                        <div 
                          key={contract.id} 
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <h3 className="font-medium text-gray-900 truncate text-sm">
                                  {contract.title}
                                </h3>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(contract)}`}></div>
                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                  contract.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                  contract.status === 'SIGNED' ? 'bg-blue-100 text-blue-800' :
                                  contract.status === 'PENDING' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {getDisplayStatus(contract)}
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-2">
                              <ContractActions
                                contractId={contract.id}
                                status={contract.status}
                                contract={contract}
                                onEdit={() => handleEditContract(contract)}
                                onDelete={() => handleConfirmDelete(contract.id)}
                                onSend={() => handleSendContract(contract)}
                                onView={() => handleViewContract(contract)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>{format(new Date(contract.updatedAt), 'MMM dd, yyyy')}</span>
                            <span>{contract.metadata?.signers?.length || 0} signers</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Completed Contracts - Updated mobile optimization */}
            {getCompletedContracts().length > 0 && (
              <Card className="border-gray-100">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Check className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Completed Contracts</CardTitle>
                      <CardDescription className="text-gray-600">
                        Successfully completed contracts with blockchain verification
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {getCompletedContracts().map((contract) => {
                      const walrusData = contract.metadata?.walrus;
                      const blobId = walrusData?.storage?.blobId;
                      const documentIdHex = walrusData?.encryption?.documentId;
                      const allowlistId = walrusData?.encryption?.allowlistId;
                      const hasBlockchainData = blobId && documentIdHex && allowlistId;
                      
                      return (
                        <div key={contract.id} className="border rounded-lg p-3 sm:p-4 bg-white hover:bg-gray-50 transition-all border-gray-200">
                          {/* Card Header - Mobile optimized */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div 
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => handleViewContract(contract)}
                              >
                                <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />
                                <h3 className="font-semibold text-gray-900 truncate text-sm hover:text-green-600 transition-colors">
                                  {contract.title}
                                </h3>
                              </div>
                            </div>
                          </div>

                          {/* Blockchain Status Indicators - Mobile optimized */}
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-1.5">
                              <Database className="h-3 w-3 text-blue-500" />
                              <span className="text-xs text-gray-600">
                                {blobId ? 'Stored' : 'No Storage'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Shield className="h-3 w-3 text-purple-500" />
                              <span className="text-xs text-gray-600">
                                {allowlistId ? 'Encrypted' : 'No Encryption'}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons - Mobile optimized */}
                          <div className="space-y-2 mb-3">
                            {/* Decrypt and Download Button */}
                            {hasBlockchainData && (
                              <>
                                {/* Hidden DecryptButton component */}
                                <div className="hidden">
                                  <DecryptButton
                                    ref={(ref) => {
                                      if (ref) {
                                        (contract as any)._decryptRef = ref;
                                      }
                                    }}
                                    contractId={contract.id}
                                    blobId={blobId!}
                                    documentIdHex={documentIdHex!}
                                    allowlistId={allowlistId!}
                                    status={contract.status}
                                  />
                                </div>
                                
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if ((contract as any)._decryptRef) {
                                      await (contract as any)._decryptRef.handleDecrypt();
                                    }
                                  }}
                                  className="w-full text-xs flex items-center justify-center gap-2 h-8"
                                >
                                  <FileDown className="h-3 w-3" />
                                  Decrypt and Download
                                </Button>
                              </>
                            )}

                            {/* Download Recovery Data Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  console.log('Download Recovery Data - Contract object:', contract);
                                  
                                  toast({
                                    title: "Preparing Recovery Data",
                                    description: "Extracting recovery information...",
                                  });
                                  
                                  const recoveryData = extractRecoveryData(contract);
                                  if (recoveryData) {
                                    downloadRecoveryData(recoveryData);
                                    toast({
                                      title: "Recovery Data Downloaded",
                                      description: "Your contract recovery file has been saved. Store it securely!",
                                      variant: "success",
                                    });
                                  } else {
                                    toast({
                                      title: "Download Failed",
                                      description: "No recovery data available for this contract.",
                                      variant: "destructive",
                                    });
                                  }
                                } catch (error) {
                                  console.error('Error downloading recovery data:', error);
                                  toast({
                                    title: "Download Failed",
                                    description: "There was a problem generating the recovery file. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="w-full text-xs flex items-center justify-center gap-2 h-8"
                            >
                              <Download className="h-3 w-3" />
                              Download Recovery Data
                            </Button>

                            {/* View Blockchain Details Button */}
                            {hasBlockchainData && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewBlockchainDetails(contract)}
                                className="w-full text-xs flex items-center justify-center gap-2 h-8"
                              >
                                <Database className="h-3 w-3" />
                                View Blockchain Details
                              </Button>
                            )}
                          </div>

                          {/* Contract Info */}
                          <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
                            <span>{format(new Date(contract.updatedAt), 'MMM dd, yyyy')}</span>
                            <span>{contract.metadata?.signers?.length || 0} signers</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Delete confirmation dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to delete this contract?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the contract and remove it from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteContract} className="bg-red-600 hover:bg-red-700 text-white">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Blockchain Details Modal - Mobile Optimized */}
          <Dialog 
            open={isBlockchainDetailsOpen} 
            onOpenChange={(open) => {
              if (!open) {
                handleCloseBlockchainDetails();
              }
            }}
          >
            <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
              <DialogHeader className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Database className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  Blockchain Details
                </DialogTitle>
                <DialogDescription className="text-sm sm:text-base mt-1">
                  Detailed blockchain information for "{blockchainDetailsContract?.title}"
                </DialogDescription>
              </DialogHeader>
              
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                {blockchainDetailsContract && (
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    {/* Contract Overview */}
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm sm:text-base">
                        <FileText className="h-4 w-4" />
                        Contract Overview
                      </h3>
                      <div className="space-y-3 sm:space-y-2">
                        <div className="flex justify-between items-center py-1">
                          <span className="text-gray-600 text-sm">Status:</span>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="font-medium text-green-700 text-sm">Completed</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-gray-600 text-sm">Completed:</span>
                          <span className="font-medium text-sm text-right">
                            {format(new Date(blockchainDetailsContract.updatedAt), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-gray-600 text-sm">Signers:</span>
                          <span className="font-medium text-sm">{blockchainDetailsContract.metadata?.signers?.length || 0}</span>
                        </div>
                        <div className="flex justify-between items-start py-1">
                          <span className="text-gray-600 text-sm">Owner:</span>
                          <span className="font-medium text-sm text-right max-w-[60%] break-words">
                            {blockchainDetailsContract.owner?.name || blockchainDetailsContract.owner?.email}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Walrus Storage Details */}
                    {blockchainDetailsContract.metadata?.walrus?.storage?.blobId && (
                      <div className="border rounded-lg p-3 sm:p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                          <Database className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                          Walrus Storage
                        </h3>
                        <div className="space-y-2">
                          {/* Mobile-optimized BlockchainAddress */}
                          <div className="space-y-2">
                            <div className="flex flex-col space-y-1">
                              <span className="text-sm text-gray-600 font-medium">Blob ID:</span>
                              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                <span className="text-xs font-mono text-gray-900 break-all flex-1">
                                  {blockchainDetailsContract.metadata.walrus.storage.blobId}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(blockchainDetailsContract.metadata!.walrus!.storage!.blobId!);
                                      toast({
                                        title: "Copied!",
                                        description: "Blob ID copied to clipboard",
                                        variant: "success",
                                      });
                                    } catch (err) {
                                      console.error('Failed to copy:', err);
                                    }
                                  }}
                                  className="h-8 w-8 p-0 flex-shrink-0"
                                  title="Copy Blob ID"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {blockchainDetailsContract.metadata.walrus.storage.uploadedAt && (
                            <div className="flex justify-between items-center py-2 border-t border-gray-100">
                              <span className="text-sm text-gray-600">Uploaded:</span>
                              <span className="text-sm font-medium">
                                {format(new Date(blockchainDetailsContract.metadata.walrus.storage.uploadedAt), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Walrus Explorer Button */}
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <Button
                            variant="outline"
                            onClick={() => {
                              window.open(getWalrusExplorerUrl(blockchainDetailsContract.metadata!.walrus!.storage!.blobId!), '_blank');
                            }}
                            className="w-full flex items-center justify-center gap-2 h-10"
                          >
                            <Database className="h-4 w-4" />
                            <span className="text-sm">View in Walrus Explorer</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* SEAL Encryption Details */}
                    {blockchainDetailsContract.metadata?.walrus?.encryption?.allowlistId && (
                      <div className="border rounded-lg p-3 sm:p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                          <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                          SEAL Encryption
                        </h3>
                        <div className="space-y-3">
                          {/* Allowlist ID */}
                          <div className="space-y-2">
                            <div className="flex flex-col space-y-1">
                              <span className="text-sm text-gray-600 font-medium">Allowlist ID:</span>
                              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                <span className="text-xs font-mono text-gray-900 break-all flex-1">
                                  {blockchainDetailsContract.metadata.walrus.encryption.allowlistId}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(blockchainDetailsContract.metadata!.walrus!.encryption!.allowlistId!);
                                      toast({
                                        title: "Copied!",
                                        description: "Allowlist ID copied to clipboard",
                                        variant: "success",
                                      });
                                    } catch (err) {
                                      console.error('Failed to copy:', err);
                                    }
                                  }}
                                  className="h-8 w-8 p-0 flex-shrink-0"
                                  title="Copy Allowlist ID"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Document ID */}
                          {blockchainDetailsContract.metadata.walrus.encryption.documentId && (
                            <div className="space-y-2">
                              <div className="flex flex-col space-y-1">
                                <span className="text-sm text-gray-600 font-medium">Document ID:</span>
                                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                  <span className="text-xs font-mono text-gray-900 break-all flex-1">
                                    {blockchainDetailsContract.metadata.walrus.encryption.documentId}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(blockchainDetailsContract.metadata!.walrus!.encryption!.documentId!);
                                        toast({
                                          title: "Copied!",
                                          description: "Document ID copied to clipboard",
                                          variant: "success",
                                        });
                                      } catch (err) {
                                        console.error('Failed to copy:', err);
                                      }
                                    }}
                                    className="h-8 w-8 p-0 flex-shrink-0"
                                    title="Copy Document ID"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Cap ID */}
                          {blockchainDetailsContract.metadata.walrus.encryption.capId && (
                            <div className="space-y-2">
                              <div className="flex flex-col space-y-1">
                                <span className="text-sm text-gray-600 font-medium">Cap ID:</span>
                                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                  <span className="text-xs font-mono text-gray-900 break-all flex-1">
                                    {blockchainDetailsContract.metadata.walrus.encryption.capId}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(blockchainDetailsContract.metadata!.walrus!.encryption!.capId!);
                                        toast({
                                          title: "Copied!",
                                          description: "Cap ID copied to clipboard",
                                          variant: "success",
                                        });
                                      } catch (err) {
                                        console.error('Failed to copy:', err);
                                      }
                                    }}
                                    className="h-8 w-8 p-0 flex-shrink-0"
                                    title="Copy Cap ID"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Sui Explorer Button */}
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <Button
                            variant="outline"
                            onClick={() => {
                              window.open(getSuiExplorerUrl(blockchainDetailsContract.metadata!.walrus!.encryption!.allowlistId!), '_blank');
                            }}
                            className="w-full flex items-center justify-center gap-2 h-10"
                          >
                            <Shield className="h-4 w-4" />
                            <span className="text-sm">View on Sui Explorer</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Authorized Wallets */}
                    {blockchainDetailsContract.metadata?.walrus?.authorizedWallets && 
                     blockchainDetailsContract.metadata.walrus.authorizedWallets.length > 0 && (
                      <div className="border rounded-lg p-3 sm:p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                          <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                          Authorized Wallets
                        </h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-sm text-gray-600">Total Authorized:</span>
                            <span className="text-sm font-medium">{blockchainDetailsContract.metadata.walrus.authorizedWallets.length} wallet(s)</span>
                          </div>
                          
                          <div className="space-y-4">
                            {blockchainDetailsContract.metadata.walrus.authorizedWallets.map((wallet, index) => {
                              // Find the corresponding email by matching wallet address from signatures
                              const matchingSignature = blockchainDetailsContract.signatures?.find(
                                sig => sig.walletAddress === wallet
                              );
                              const correspondingEmail = matchingSignature?.user?.email;
                              
                              return (
                                <div key={index} className="bg-gray-50 rounded-lg p-3 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-900">Signer {index + 1}</span>
                                    {correspondingEmail && (
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                        Verified
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Email Address */}
                                  <div className="space-y-2">
                                    <span className="text-sm text-gray-600 font-medium">Email:</span>
                                    {correspondingEmail ? (
                                      <div className="flex items-center gap-2 bg-white p-2 rounded border">
                                        <span className="text-sm text-gray-900 break-all flex-1">
                                          {correspondingEmail}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(correspondingEmail);
                                              toast({
                                                title: "Copied!",
                                                description: "Email address copied to clipboard",
                                                variant: "success",
                                              });
                                            } catch (err) {
                                              console.error('Failed to copy:', err);
                                            }
                                          }}
                                          className="h-8 w-8 p-0 flex-shrink-0"
                                          title="Copy email"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-gray-400 italic">Not available</span>
                                    )}
                                  </div>
                                  
                                  {/* Wallet Address */}
                                  <div className="space-y-2">
                                    <span className="text-sm text-gray-600 font-medium">Wallet:</span>
                                    <div className="flex items-center gap-2 bg-white p-2 rounded border">
                                      <span className="text-xs font-mono text-gray-900 break-all flex-1">
                                        {wallet}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(wallet);
                                            toast({
                                              title: "Copied!",
                                              description: "Wallet address copied to clipboard",
                                              variant: "success",
                                            });
                                          } catch (err) {
                                            console.error('Failed to copy:', err);
                                          }
                                        }}
                                        className="h-8 w-8 p-0 flex-shrink-0"
                                        title="Copy wallet address"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Additional Signers (if any emails without corresponding wallets) */}
                          {blockchainDetailsContract.signatures && 
                           blockchainDetailsContract.signatures.some(sig => 
                             !blockchainDetailsContract.metadata?.walrus?.authorizedWallets?.includes(sig.walletAddress || '')
                           ) && (
                            <div className="mt-4 pt-3 border-t border-gray-200">
                              <h4 className="text-sm font-medium text-gray-900 mb-3">Additional Signers (No Blockchain Wallet)</h4>
                              <div className="space-y-3">
                                {blockchainDetailsContract.signatures
                                  .filter(sig => 
                                    !blockchainDetailsContract.metadata?.walrus?.authorizedWallets?.includes(sig.walletAddress || '')
                                  )
                                  .map((signature, index) => (
                                    <div key={index} className="bg-yellow-50 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-900">
                                          Additional Signer {index + 1}
                                        </span>
                                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                          Not on Blockchain
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        <span className="text-sm text-gray-600 font-medium">Email:</span>
                                        <div className="flex items-center gap-2 bg-white p-2 rounded border">
                                          <span className="text-sm text-gray-900 break-all flex-1">
                                            {signature.user.email}
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                              try {
                                                await navigator.clipboard.writeText(signature.user.email);
                                                toast({
                                                  title: "Copied!",
                                                  description: "Email address copied to clipboard",
                                                  variant: "success",
                                                });
                                              } catch (err) {
                                                console.error('Failed to copy:', err);
                                              }
                                            }}
                                            className="h-8 w-8 p-0 flex-shrink-0"
                                            title="Copy email"
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Fixed Footer */}
              <div className="flex-shrink-0 border-t border-gray-200 p-4 sm:p-6">
                <Button 
                  variant="outline" 
                  onClick={handleCloseBlockchainDetails}
                  className="w-full h-10"
                >
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
} 