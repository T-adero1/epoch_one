'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Search, ChevronDown, ArrowLeft, AlertCircle, Info, Check, Loader2, Trash2, User } from 'lucide-react';
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
  
  // Enhanced signer change handler for contract creation
  const handleNewContractSignerChange = (index: number, value: string) => {
    const newSigners = [...newContract.signers];
    const newErrors = [...newContractSignerErrors];
    const newValidating = [...isValidatingNewContractEmails];
    
    newSigners[index] = value; // Keep original case for display
    newValidating[index] = true;
    
    // Clear previous error
    newErrors[index] = '';
    
    setNewContract({ ...newContract, signers: newSigners });
    setNewContractSignerErrors(newErrors);
    setIsValidatingNewContractEmails(newValidating);
    
    // Debounced validation
    setTimeout(() => {
      const trimmedValue = value.trim();
      const updatedErrors = [...newContractSignerErrors];
      const updatedValidating = [...isValidatingNewContractEmails];
      
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
      setNewContractSignerErrors(updatedErrors);
      setIsValidatingNewContractEmails(updatedValidating);
    }, 500); // 500ms debounce
  };

  // Helper to add new signer for contract creation
  const handleAddNewContractSigner = () => {
    setNewContract({ 
      ...newContract, 
      signers: [...newContract.signers, ''] 
    });
    setNewContractSignerErrors([...newContractSignerErrors, '']);
    setIsValidatingNewContractEmails([...isValidatingNewContractEmails, false]);
  };

  // Helper to remove signer for contract creation
  const handleRemoveNewContractSigner = (index: number) => {
    const newSigners = [...newContract.signers];
    const newErrors = [...newContractSignerErrors];
    const newValidating = [...isValidatingNewContractEmails];
    
    newSigners.splice(index, 1);
    newErrors.splice(index, 1);
    newValidating.splice(index, 1);
    
    // Ensure at least one empty signer field
    if (newSigners.length === 0) {
      newSigners.push('');
      newErrors.push('');
      newValidating.push(false);
    }
    
    setNewContract({ ...newContract, signers: newSigners });
    setNewContractSignerErrors(newErrors);
    setIsValidatingNewContractEmails(newValidating);
  };

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

      // Reset the form
      const resetForm = () => {
        setNewContract({ title: '', description: '', content: '', signers: [''] });
        setNewContractSignerErrors(['']);
        setIsValidatingNewContractEmails([false]);
      };

      // Immediately close the creation modal and open editor optimistically
      setIsCreatingContract(false);
      resetForm();
      setSelectedContract(tempContract);
      setIsEditingContract(true);
      
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

      // Update with the real contract data
      setContracts([actualContract as unknown as ContractWithRelations, ...contracts]);
      setSelectedContract(actualContract as unknown as ContractWithRelations);
      
      toast({
        title: "Contract Created",
        description: `Contract created with ${validSigners.length} signer(s).`,
        variant: "success",
      });
    
    } catch (error) {
      console.error('Error creating contract:', error);
      
      // Revert optimistic changes on error
      setIsEditingContract(false);
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
          onBack={() => setIsViewingContract(false)}
          onUpdate={handleUpdateContract}
          defaultTab={selectedContractTab}
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
          onSave={(updated) => {
            handleUpdateContract(updated);
            setIsEditingContract(false);
          }}
          onCancel={() => setIsEditingContract(false)}
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

          <div className="grid gap-6">
            <Card className="border-gray-100">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-gray-900">Your Contracts</CardTitle>
                  <CardDescription className="text-gray-600">Manage and track your contracts</CardDescription>
                </div>
                <Dialog open={isCreatingContract} onOpenChange={(open) => {
                  setIsCreatingContract(open);
                  if (!open) {
                    // Reset form when dialog closes
                    setNewContract({ title: '', description: '', content: '', signers: [''] });
                    setNewContractSignerErrors(['']);
                    setIsValidatingNewContractEmails([false]);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      New Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-gray-900">Create New Contract</DialogTitle>
                      <DialogDescription className="text-gray-600">
                        Fill in the details below to create a new contract.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
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
                    <DialogFooter>
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
              <CardContent>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input 
                      placeholder="Search contracts..." 
                      className="pl-8 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}>
                    <SelectTrigger className="w-full sm:w-[180px] border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block">
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

                {/* Mobile Card View - Enhanced for consistency */}
                <div className="md:hidden space-y-3">
                  {filteredContracts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No contracts found. Create your first contract by clicking the "New Contract" button.
                    </div>
                  ) : (
                    filteredContracts.map((contract) => (
                      <div key={contract.id} className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors min-h-[120px]">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0 pr-3">
                            <div 
                              className="flex items-center gap-2 cursor-pointer mb-2"
                              onClick={() => handleViewContract(contract)}
                            >
                              <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <h3 className="font-medium text-gray-900 truncate text-sm">{contract.title}</h3>
                            </div>
                            <div className="flex items-center gap-2 mb-2 min-h-[20px]">
                              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(contract)}`}></span>
                              <span className="text-sm text-gray-600 font-medium">{getDisplayStatus(contract)}</span>
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                          <ContractActions 
                            contractId={contract.id}
                            status={contract.status}
                            contract={contract}
                            onView={() => handleViewContract(contract)}
                            onEdit={() => handleEditContract(contract)}
                            onDelete={() => handleConfirmDelete(contract.id)}
                            onSend={() => handleSendContract(contract)}
                          />
                        </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                          <span>{format(new Date(contract.createdAt), 'MMM dd, yyyy')}</span>
                          <span>{contract.metadata?.signers?.length || 0} signers</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
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
        </>
      )}
    </div>
  );
} 