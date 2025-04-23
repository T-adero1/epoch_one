'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Heading, Text, VStack, Button, Flex, Icon, Spinner } from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';

// Define params type for Next.js App Router
interface PageParams {
  id: string;
  [key: string]: string | string[];
}

export default function SignSuccessPage() {
  const router = useRouter();
  const params = useParams<PageParams>();
  const inviteId = params?.id;
  
  const [loading, setLoading] = useState(true);
  const [documentDetails, setDocumentDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchDocumentDetails() {
      try {
        setLoading(true);
        const response = await fetch(`/api/invite/${inviteId}`);
        const data = await response.json();
        
        if (!response.ok) {
          setError(data.error || 'Failed to load document details');
          return;
        }
        
        if (data.status !== 'signed') {
          setError('This document has not been signed yet.');
          return;
        }
        
        setDocumentDetails(data);
      } catch (err) {
        setError('Failed to load document details. Please try again.');
        console.error('Error fetching document details:', err);
      } finally {
        setLoading(false);
      }
    }
    
    if (inviteId) {
      fetchDocumentDetails();
    }
  }, [inviteId]);
  
  if (loading) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack gap={4}>
          <Spinner size="xl" />
          <Text>Loading document details...</Text>
        </VStack>
      </Flex>
    );
  }
  
  if (error) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack gap={4} maxW="600px" p={5} textAlign="center">
          <Icon as={CheckCircleIcon} w={20} h={20} color="red.500" />
          <Heading>Error</Heading>
          <Text>{error}</Text>
          <Button onClick={() => router.push('/')} colorScheme="blue">
            Return Home
          </Button>
        </VStack>
      </Flex>
    );
  }
  
  return (
    <Flex minHeight="100vh" align="center" justify="center" bg="gray.50">
      <Box
        maxW="600px"
        w="90%"
        p={8}
        borderRadius="lg"
        boxShadow="xl"
        bg="white"
        textAlign="center"
      >
        <VStack gap={6}>
          <Icon as={CheckCircleIcon} w={20} h={20} color="green.500" />
          
          <Heading size="lg">Document Successfully Signed!</Heading>
          
          <Text>
            You have successfully signed "{documentDetails.documentTitle}". 
            A confirmation has been sent to your email.
          </Text>
          
          <Box bg="gray.50" p={4} borderRadius="md" width="full" textAlign="left">
            <Text><strong>Document:</strong> {documentDetails.documentTitle}</Text>
            <Text>
              <strong>Signed at:</strong> {new Date(documentDetails.signedAt).toLocaleString()}
            </Text>
            <Text><strong>Signed by:</strong> {documentDetails.signerName}</Text>
            <Text><strong>Reference ID:</strong> {documentDetails.id}</Text>
          </Box>
          
          <Text fontSize="sm" color="gray.600">
            A copy of this document has been securely stored. If you need to access this 
            document in the future, please contact the document sender.
          </Text>
          
          <Button colorScheme="blue" size="lg" onClick={() => router.push('/')}>
            Return Home
          </Button>
        </VStack>
      </Box>
    </Flex>
  );
} 