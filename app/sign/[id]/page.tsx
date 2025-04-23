'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Button, 
  Text, 
  Box, 
  Stack, 
  Heading, 
  Flex, 
  Input, 
  Spinner,
  FormControl,
  FormLabel
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';

// Create a params object type
interface PageParams extends Record<string, string> {
  id: string;
}

export default function SignDocumentPage() {
  // Fix the type for useParams
  const params = useParams<PageParams>();
  const router = useRouter();
  const { toast } = useToast();
  const inviteId = params?.id as string;
  
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [inviteDetails, setInviteDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  
  useEffect(() => {
    async function fetchInviteDetails() {
      try {
        setLoading(true);
        console.log(`Fetching invite details for ID: ${inviteId}`);
        const response = await fetch(`/api/invite/${inviteId}`);
        
        // Try to get detailed error information if the response is not OK
        if (!response.ok) {
          console.error(`Error response status: ${response.status}`);
          let errorMessage = 'Failed to load document details';
          let errorDetails = '';
          
          try {
            const errorData = await response.json();
            console.error('API error response:', errorData);
            
            if (errorData.error) {
              errorMessage = errorData.error;
            }
            
            if (errorData.details) {
              errorDetails = errorData.details;
            }
            
            setError(`${errorMessage}${errorDetails ? `: ${errorDetails}` : ''}`);
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError);
            setError(`${errorMessage} (Status ${response.status})`);
          }
          return;
        }
        
        const data = await response.json();
        console.log('Successfully fetched invite details:', data);
        setInviteDetails(data.invite);
      } catch (err) {
        console.error('Error fetching invite details:', err);
        setError('Failed to load document details. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    if (inviteId) {
      fetchInviteDetails();
    }
  }, [inviteId]);
  
  const handleSignDocument = async () => {
    if (!signerName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your full name to sign the document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    try {
      setSigning(true);
      console.log(`Submitting signature for invite ID: ${inviteId}`);
      
      // In a real implementation, this would include:
      // 1. Capturing a digital signature
      // 2. Hash verification of the document
      // 3. Potentially MFA or other identity verification
      const signature = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const response = await fetch('/api/invite/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteId,
          signerName,
          signature,
        }),
      });
      
      // Get detailed error information if the response is not OK
      if (!response.ok) {
        console.error(`Sign API error response status: ${response.status}`);
        let errorMessage = 'Failed to sign document';
        
        try {
          const errorData = await response.json();
          console.error('Sign API error response:', errorData);
          
          if (errorData.error) {
            errorMessage = errorData.error;
          }
          
          if (errorData.details) {
            errorMessage += `: ${errorData.details}`;
          }
          
          throw new Error(errorMessage);
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message !== 'Failed to sign document') {
            throw parseError;
          }
          console.error('Failed to parse sign API error response:', parseError);
          throw new Error(`${errorMessage} (Status ${response.status})`);
        }
      }
      
      const result = await response.json();
      console.log('Successfully signed document:', result);
      
      toast({
        title: 'Document signed!',
        description: 'The document has been successfully signed.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Redirect to success page
      router.push(`/sign/${inviteId}/success`);
      
    } catch (err: any) {
      console.error('Error signing document:', err);
      toast({
        title: 'Signing failed',
        description: err.message || 'Failed to sign document. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSigning(false);
    }
  };
  
  if (loading) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Stack direction="column" gap={4}>
          <Spinner size="xl" />
          <Text>Loading document details...</Text>
        </Stack>
      </Flex>
    );
  }
  
  if (error) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Stack direction="column" gap={4} maxW="600px" p={5}>
          <Heading color="red.500">Error</Heading>
          <Text>{error}</Text>
          <Button onClick={() => router.push('/')} colorScheme="blue">
            Return Home
          </Button>
        </Stack>
      </Flex>
    );
  }
  
  if (!inviteDetails) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Stack direction="column" gap={4} maxW="600px" p={5}>
          <Heading>Document Not Found</Heading>
          <Text>The requested document signing invitation could not be found or has expired.</Text>
          <Button onClick={() => router.push('/')} colorScheme="blue">
            Return Home
          </Button>
        </Stack>
      </Flex>
    );
  }
  
  // Handle expired invites
  if (inviteDetails.status === 'expired') {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Stack direction="column" gap={4} maxW="600px" p={5} textAlign="center">
          <Heading>Invitation Expired</Heading>
          <Text>
            This document signing invitation has expired. Please contact the sender to request a new invitation.
          </Text>
          <Button onClick={() => router.push('/')} colorScheme="blue">
            Return Home
          </Button>
        </Stack>
      </Flex>
    );
  }
  
  // Handle already signed documents
  if (inviteDetails.status === 'signed') {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Stack direction="column" gap={4} maxW="600px" p={5} textAlign="center">
          <Heading>Document Already Signed</Heading>
          <Text>
            This document has already been signed. No further action is required.
          </Text>
          <Button onClick={() => router.push('/')} colorScheme="blue">
            Return Home
          </Button>
        </Stack>
      </Flex>
    );
  }
  
  return (
    <Flex minHeight="100vh" align="center" justify="center" bg="gray.50">
      <Box
        maxW="800px"
        w="90%"
        p={6}
        borderRadius="lg"
        boxShadow="xl"
        bg="white"
      >
        <Stack direction="column" gap={6} align="stretch">
          <Heading size="lg">Sign Document</Heading>
          
          <Box>
            <Heading size="md" mb={2}>
              Document Details
            </Heading>
            <Box bg="gray.50" p={4} borderRadius="md">
              <Text><strong>Title:</strong> {inviteDetails.documentTitle}</Text>
              <Text><strong>From:</strong> {inviteDetails.senderName}</Text>
              <Text><strong>To:</strong> {inviteDetails.recipientEmail}</Text>
              <Text>
                <strong>Expires:</strong> {new Date(inviteDetails.expiresAt).toLocaleString()}
              </Text>
            </Box>
          </Box>
          
          <Box>
            <Heading size="md" mb={2}>
              Document Preview
            </Heading>
            <Box
              h="200px"
              bg="gray.100"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="gray.500">
                Document preview would be shown here in a real implementation
              </Text>
            </Box>
          </Box>
          
          <FormControl id="signerName">
            <FormLabel>Your Full Name</FormLabel>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full legal name"
              size="lg"
            />
          </FormControl>
          
          <Box>
            <Text fontSize="sm" color="gray.600" mb={4}>
              By clicking &quot;Sign Document&quot;, you acknowledge that you have read and agree to the terms of this document,
              and that your electronic signature will be legally binding.
            </Text>
            
            <Flex gap={4}>
              <Button
                colorScheme="blue"
                size="lg"
                onClick={handleSignDocument}
                isLoading={signing}
                loadingText="Signing..."
                w="full"
              >
                Sign Document
              </Button>
              
              <Button
                variant="outline"
                size="lg"
                onClick={() => router.push('/')}
                isDisabled={signing}
                w="full"
              >
                Cancel
              </Button>
            </Flex>
          </Box>
        </Stack>
      </Box>
    </Flex>
  );
} 