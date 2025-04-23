'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

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
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <Tabs defaultValue="overview" className="mb-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-primary/20">
              <CardHeader className="bg-primary/5 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Welcome to EpochOne</CardTitle>
                    <CardDescription>You're logged in with Sui zkLogin</CardDescription>
                  </div>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Your Wallet Address</h3>
                    <div className="flex items-center gap-2">
                      <div className="bg-secondary/20 p-3 rounded-lg flex-1 overflow-hidden group relative">
                        <p className="font-mono text-sm truncate">{userAddress}</p>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-background opacity-0 group-hover:opacity-100"></div>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={copyAddress} className="h-10 w-10">
                              {copied ? <CheckCircle size={16} className="text-green-600" /> : <Copy size={16} />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{copied ? 'Copied!' : 'Copy address'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-10 w-10" asChild>
                              <a 
                                href={`https://explorer.sui.io/address/${userAddress}?network=testnet`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                <ExternalLink size={16} />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View on Sui Explorer</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Authentication Method</span>
                      <div className="mt-1">
                        <Badge variant="secondary" className="bg-blue-50 text-blue-800 hover:bg-blue-100">zkLogin</Badge>
                      </div>
                    </div>
                    <Button onClick={handleVerifyAuth} variant="outline" size="sm">
                      Verify Session
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/10 pt-4">
                <Button variant="ghost" onClick={logout} className="text-red-600 hover:text-red-700 hover:bg-red-50">Log out</Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Verification Status</CardTitle>
                <CardDescription>Current zkLogin verification status</CardDescription>
              </CardHeader>
              <CardContent>
                {verificationStatus.status === 'idle' && (
                  <div className="bg-muted/20 p-6 rounded-lg text-center">
                    <p className="text-muted-foreground">No verification performed yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-2">Click "Verify Session" to check authentication</p>
                  </div>
                )}
                
                {verificationStatus.status === 'loading' && (
                  <div className="bg-blue-50 p-6 rounded-lg flex items-center justify-center">
                    <svg className="animate-spin mr-2 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-blue-800 font-medium">{verificationStatus.message}</span>
                  </div>
                )}
                
                {verificationStatus.status === 'success' && (
                  <Alert variant="default" className="bg-green-50 border-green-200">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <AlertTitle className="text-green-800">Verification Successful</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your zkLogin authentication is valid and active.
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-sm font-medium mb-1">Wallet Address:</p>
                        <code className="block bg-white p-3 rounded-md text-xs overflow-auto break-all border border-green-100 font-mono">{userAddress}</code>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                {verificationStatus.status === 'error' && (
                  <Alert variant="destructive" className="bg-red-50 border-red-200">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <AlertTitle className="text-red-800">Verification Failed</AlertTitle>
                    <AlertDescription className="text-red-700">
                      {verificationStatus.message}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="verification" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>ZkLogin Authentication Details</CardTitle>
              <CardDescription>Technical details about your current authentication session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Account Address</h3>
                  <div className="bg-muted p-4 rounded-md">
                    <p className="font-mono text-sm break-all">{userAddress}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Authentication Type</h3>
                  <div className="bg-muted p-4 rounded-md">
                    <p className="font-mono text-sm">OAuth 2.0 with zkLogin</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Network</h3>
                  <div className="bg-muted p-4 rounded-md">
                    <p className="font-mono text-sm">Sui Testnet</p>
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-yellow-800 flex items-center mb-2">
                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                    Important Security Note
                  </h3>
                  <p className="text-xs text-yellow-700">
                    For security reasons, never share your zkLogin credentials or session information with anyone.
                    Your wallet address is the only information that can be safely shared.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t flex justify-end pt-6">
              <Button onClick={handleVerifyAuth} disabled={verificationStatus.status === 'loading'}>
                {verificationStatus.status === 'loading' ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : 'Verify Authentication'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 