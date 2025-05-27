'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import ContractActions from '@/components/contracts/ContractActions';

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
    walrus?: any;
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

interface ContractsCardProps {
  contracts: ContractWithRelations[];
  isLoading?: boolean;
  user?: {
    id?: string;
    email?: string;
  } | null;
  onCreateContract: (contract: {
    title: string;
    description: string;
    content: string;
    signers: string[];
  }) => Promise<void>;
  onViewContract: (contract: ContractWithRelations) => void;
  onEditContract: (contract: ContractWithRelations) => void;
  onDeleteContract: (contractId: string) => void;
  onSendContract: (contract: ContractWithRelations) => void;
  getDisplayStatus: (contract: ContractWithRelations) => string;
  getStatusColor: (contract: ContractWithRelations) => string;
}

export default function ContractsCard({
  contracts,
  isLoading = false,
  user,
  onCreateContract,
  onViewContract,
  onEditContract,
  onDeleteContract,
  onSendContract,
  getDisplayStatus,
  getStatusColor
}: ContractsCardProps) {
  const [isCreatingContract, setIsCreatingContract] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [newContract, setNewContract] = useState({
    title: '',
    description: '',
    content: '',
    signers: [''],
  });

  const handleCreateContract = async () => {
    if (!newContract.title || !newContract.description) return;

    try {
      await onCreateContract(newContract);
      setIsCreatingContract(false);
      setNewContract({ title: '', description: '', content: '', signers: [''] });
    } catch (error) {
      console.error('Error creating contract:', error);
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
      <Card className="border-gray-100 opacity-40">
        <CardHeader>
          <CardTitle className="text-gray-900">Your Contracts</CardTitle>
          <CardDescription className="text-gray-600">Loading contracts...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Loading contracts...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-100">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle className="text-gray-900">Your Contracts</CardTitle>
          <CardDescription className="text-gray-600">Manage and track your contracts</CardDescription>
        </div>
        <Dialog open={isCreatingContract} onOpenChange={setIsCreatingContract}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
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
                    No contracts found. Create your first contract by clicking the "New Contract" button.
                  </TableCell>
                </TableRow>
              ) : (
                filteredContracts.map((contract) => (
                  <TableRow key={contract.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-900">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewContract(contract)}>
                        <FileText className="h-4 w-4 text-blue-600" />
                        {contract.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(contract)}`}></span>
                        {getDisplayStatus(contract)}
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
                      <ContractActions 
                        contractId={contract.id}
                        status={contract.status}
                        contract={contract}
                        onView={() => onViewContract(contract)}
                        onEdit={() => onEditContract(contract)}
                        onDelete={() => onDeleteContract(contract.id)}
                        onSend={() => onSendContract(contract)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {filteredContracts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No contracts found. Create your first contract by clicking the "New Contract" button.
            </div>
          ) : (
            filteredContracts.map((contract) => (
              <div key={contract.id} className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div 
                      className="flex items-center gap-2 cursor-pointer mb-2"
                      onClick={() => onViewContract(contract)}
                    >
                      <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <h3 className="font-medium text-gray-900 truncate">{contract.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(contract)}`}></span>
                      <span className="text-sm text-gray-600">{getDisplayStatus(contract)}</span>
                    </div>
                  </div>
                  <ContractActions 
                    contractId={contract.id}
                    status={contract.status}
                    contract={contract}
                    onView={() => onViewContract(contract)}
                    onEdit={() => onEditContract(contract)}
                    onDelete={() => onDeleteContract(contract.id)}
                    onSend={() => onSendContract(contract)}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{format(new Date(contract.createdAt), 'MMM dd, yyyy')}</span>
                  <span>{contract.metadata?.signers?.length || 0} signers</span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
} 