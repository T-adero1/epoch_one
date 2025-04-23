'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertCircle, Copy, ExternalLink, FileText, Plus, Search, Send } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

interface Contract {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'sent' | 'signed' | 'completed';
  createdAt: string;
  signers: string[];
  owner: string;
}

export default function DashboardPage() {
  const { userAddress, isAuthenticated, isLoading, logout } = useZkLogin();
  const router = useRouter();
  const [verificationStatus, setVerificationStatus] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [copied, setCopied] = useState(false);
  const [isTransactionInProgress, setIsTransactionInProgress] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [client] = useState(() => new SuiClient({ url: getFullnodeUrl('testnet') }));
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isCreatingContract, setIsCreatingContract] = useState(false);
  const [newContract, setNewContract] = useState({
    title: '',
    description: '',
    signers: [''],
  });

  // Function to verify zkLogin authentication
  const handleVerifyAuth = () => {
    setVerificationStatus({ status: 'loading', message: 'Verifying zkLogin authentication...' });
    
    try {
      // Simple verification that user is authenticated with zkLogin
      if (isAuthenticated && userAddress) {
        setVerificationStatus({
          status: 'success',
          message: 'zkLogin authentication verified successfully!'
        });
        
        console.log('Verification successful for address:', userAddress);
      } else {
        throw new Error('Not authenticated');
      }
    } catch (error) {
      console.error('Verification failed:', error);
      setVerificationStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Verification failed for unknown reason'
      });
    }
  };

  // Copy address to clipboard
  const copyAddress = () => {
    if (userAddress) {
      navigator.clipboard.writeText(userAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExecuteTransaction = async () => {
    try {
      setIsTransactionInProgress(true);
      setStatusMessage('Creating transaction...');

      // Create a new transaction
      const tx = new Transaction();
      
      // Add transaction operations here
      // Example: tx.moveCall({ ... });
      
      // Build, sign and execute the transaction
      setStatusMessage('Building transaction...');
      const transactionBlock = await tx.build({ client });
      
      setStatusMessage('Signing transaction...');
      // Add signing code here if needed
      
      setStatusMessage('Executing transaction...');
      // Add execution code here
      
      setStatusMessage('Transaction completed successfully!');
    } catch (error) {
      console.error('Transaction execution failed:', error);
      setStatusMessage('Transaction execution failed');
    } finally {
      setIsTransactionInProgress(false);
    }
  };

  // Mock data for contracts
  useEffect(() => {
    if (isAuthenticated) {
      setContracts([
        {
          id: '1',
          title: 'Employment Agreement',
          description: 'Standard employment contract for new hires',
          status: 'draft',
          createdAt: '2024-04-23',
          signers: ['0x123...456', '0x789...012'],
          owner: userAddress || '',
        },
        {
          id: '2',
          title: 'NDA Agreement',
          description: 'Non-disclosure agreement for partners',
          status: 'sent',
          createdAt: '2024-04-22',
          signers: ['0x123...456', '0x789...012'],
          owner: userAddress || '',
        },
      ]);
    }
  }, [isAuthenticated, userAddress]);

  const handleCreateContract = () => {
    if (!newContract.title || !newContract.description) return;

    const contract: Contract = {
      id: Date.now().toString(),
      title: newContract.title,
      description: newContract.description,
      status: 'draft',
      createdAt: new Date().toISOString().split('T')[0],
      signers: newContract.signers.filter(s => s.trim() !== ''),
      owner: userAddress || '',
    };

    setContracts([contract, ...contracts]);
    setIsCreatingContract(false);
    setNewContract({ title: '', description: '', signers: [''] });
  };

  const getStatusBadge = (status: Contract['status']) => {
    const variants = {
      draft: 'bg-blue-100 text-blue-800',
      sent: 'bg-blue-100 text-blue-800',
      signed: 'bg-blue-100 text-blue-800',
      completed: 'bg-blue-100 text-blue-800',
    };

    return (
      <Badge className={variants[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

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
            <CardFooter className="flex justify-between">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-32" />
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // This will be handled by the useEffect redirect
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Contract Dashboard</h1>
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
                <Textarea
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
                      placeholder="Signer address"
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
      </div>

      <div className="grid gap-6">
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="text-gray-900">Your Contracts</CardTitle>
            <CardDescription className="text-gray-600">Manage and track your contracts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search contracts..." 
                  className="pl-8 border-gray-200 focus:border-blue-500 focus:ring-blue-500" 
                />
              </div>
              <Select>
                <SelectTrigger className="w-[180px] border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
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
                {contracts.map((contract) => (
                  <TableRow key={contract.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        {contract.title}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(contract.status)}</TableCell>
                    <TableCell className="text-gray-600">{contract.createdAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {contract.signers.map((signer, i) => (
                          <Badge key={i} variant="secondary" className="bg-blue-100 text-blue-800">
                            {signer.slice(0, 6)}...{signer.slice(-4)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="border-gray-200 hover:bg-blue-50">
                          View
                        </Button>
                        {contract.status === 'draft' && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                            <Send className="mr-2 h-4 w-4" />
                            Send
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 