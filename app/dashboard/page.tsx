'use client';

import { useEffect, useState } from 'react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Search, ChevronDown } from 'lucide-react';
import { getContracts, createContract, deleteContract } from '@/app/utils/contracts';
import { ContractStatus } from '@prisma/client';
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

// Import our contract components
import ContractActions from '@/components/contracts/ContractActions';
import ContractDetails from '@/components/contracts/ContractDetails';
import ContractEditor from '@/components/contracts/ContractEditor';

// Rename this interface to avoid conflict with imported Contract type
interface ContractWithRelations {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: ContractStatus;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata: any | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures: {
    id: string;
    status: 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED';
    signedAt: Date | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
}

export default function DashboardPage() {
  const {  isAuthenticated, isLoading, logout, user } = useZkLogin();
  
  const [contracts, setContracts] = useState<ContractWithRelations[]>([]);
  const [isCreatingContract, setIsCreatingContract] = useState(false);
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

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user?.displayName) return 'U';
    const names = user.displayName.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };

  // Load actual contracts
  useEffect(() => {
    if (isAuthenticated && user?.email) {
      loadContracts();
    }
  }, [isAuthenticated, user?.email]);
  
  const loadContracts = async () => {
    if (!user?.email) return;
    try {
      const data = await getContracts(user.email);
      setContracts(data);
    } catch (error) {
      console.error('Error loading contracts:', error);
    }
  };

  const handleCreateContract = async () => {
    if (!newContract.title || !newContract.description || !user?.email) return;

    try {
      const contract = await createContract({
        title: newContract.title,
        description: newContract.description,
        content: newContract.content || '',
        ownerId: user.email,
        metadata: {
          signers: newContract.signers.filter(s => s.trim() !== ''),
        },
      });

      setContracts([contract, ...contracts]);
      setIsCreatingContract(false);
      setNewContract({ title: '', description: '', content: '', signers: [''] });
    } catch (error) {
      console.error('Error creating contract:', error);
    }
  };
  
  const handleConfirmDelete = (contractId: string) => {
    setContractToDelete(contractId);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteContract = async () => {
    if (!contractToDelete) return;
    try {
      await deleteContract(contractToDelete);
      setContracts(contracts.filter(c => c.id !== contractToDelete));
      setContractToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting contract:', error);
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
      
      // Refresh contracts list
      loadContracts();
      
      // Show success message
      toast({
        title: "Contract sent",
        description: "Contract is now ready for signatures.",
        variant: "success",
      });
      
      // Open the contract details to show share options
      setSelectedContract(contract);
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Loading Dashboard</h1>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // This will be handled by the useEffect redirect
  }
  
  // Use our ContractDetails component when viewing a contract
  if (isViewingContract && selectedContract) {
    return (
      <div className="container mx-auto p-6">
        <ContractDetails 
          contract={selectedContract} 
          onBack={() => setIsViewingContract(false)}
          onUpdate={handleUpdateContract}
        />
      </div>
    );
  }
  
  // Use our ContractEditor component when editing a contract
  if (isEditingContract && selectedContract) {
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

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Contract Dashboard</h1>
        
        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-gray-100">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profilePicture || ''} alt={user?.displayName || 'User'} />
                <AvatarFallback className="bg-blue-600 text-white">{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-sm">
                <span className="font-medium">{user?.displayName || 'User'}</span>
                <span className="text-xs text-gray-500">{user?.email}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <span>Settings</span>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-gray-900">Your Contracts</CardTitle>
              <CardDescription className="text-gray-600">Manage and track your contracts</CardDescription>
            </div>
            <Dialog open={isCreatingContract} onOpenChange={setIsCreatingContract}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  New Contract
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-gray-900">Create New Contract</DialogTitle>
                  <DialogDescription className="text-gray-600">
                    Fill in the details below to create a new contract.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
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
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-gray-900">Signers</label>
                    {newContract.signers.map((signer, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={signer}
                          onChange={(e) => {
                            const newSigners = [...newContract.signers];
                            newSigners[index] = e.target.value;
                            setNewContract({ ...newContract, signers: newSigners });
                          }}
                          placeholder="Signer email"
                          className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                        {index === newContract.signers.length - 1 && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setNewContract({ ...newContract, signers: [...newContract.signers, ''] })}
                            className="border-gray-200 hover:bg-blue-50"
                          >
                            <Plus className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreatingContract(false)} className="border-gray-200 hover:bg-blue-50">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateContract} className="bg-blue-600 hover:bg-blue-700">
                    Create Contract
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
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
                <SelectTrigger className="w-[180px] border-gray-200 focus:border-blue-500 focus:ring-blue-500">
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-gray-50">
                  <TableHead className="text-gray-900">Title</TableHead>
                  <TableHead className="text-gray-900">Status</TableHead>
                  <TableHead className="text-gray-900">Created</TableHead>
                  <TableHead className="text-gray-900">Signers</TableHead>
                  <TableHead className="text-right text-gray-900">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No contracts found. Create your first contract by clicking the &quot;New Contract&quot; button.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts.map((contract) => (
                    <TableRow key={contract.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-gray-900">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleViewContract(contract)}>
                          <FileText className="h-4 w-4 text-blue-600" />
                          {contract.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            contract.status === 'DRAFT' ? 'bg-blue-500' : 
                            contract.status === 'PENDING' ? 'bg-yellow-500' : 
                            contract.status === 'ACTIVE' ? 'bg-green-500' : 
                            contract.status === 'COMPLETED' ? 'bg-purple-500' : 
                            contract.status === 'EXPIRED' ? 'bg-gray-500' : 
                            'bg-red-500'
                          }`}></span>
                          <span>
                            {contract.status.charAt(0) + contract.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {format(new Date(contract.createdAt), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          {contract.metadata?.signers?.length || 0} signers
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Use our ContractActions component */}
                        <ContractActions 
                          contractId={contract.id}
                          status={contract.status}
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
    </div>
  );
} 