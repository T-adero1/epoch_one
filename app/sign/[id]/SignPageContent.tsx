'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Box,
  Text,
  Heading,
  Flex,
  VStack,
  Spinner,
  ClientOnly
} from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';

// Fetch and submit functions would need to be implemented
async function fetchInviteDetails(inviteId: string) {
  // This would be an API call to fetch the invite details
  // For demo purposes, we'll simulate a response
  return new Promise<{
    contractName: string;
    senderName: string;
    status: 'pending' | 'signed' | 'expired';
    documentUrl: string;
  }>((resolve) => {
    setTimeout(() => {
      resolve({
        contractName: 'Service Agreement',
        senderName: 'Epoch Finance',
        status: 'pending',
        documentUrl: '/sample-document.pdf',
      });
    }, 1000);
  });
}

async function submitSignedDocument(inviteId: string) {
  // This would be an API call to submit the signed document
  // For demo purposes, we'll simulate a response
  return new Promise<{ success: boolean }>((resolve) => {
    setTimeout(() => {
      resolve({ success: true });
    }, 1500);
  });
}

export default function SignPageContent({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<any>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    async function loadInviteDetails() {
      try {
        setLoading(true);
        const details = await fetchInviteDetails(inviteId);
        setInviteDetails(details);
        
        if (details.status === 'signed') {
          setSigned(true);
        } else if (details.status === 'expired') {
          setError('This signing invitation has expired.');
        }
      } catch (err) {
        setError('Failed to load document details. The invitation may be invalid or expired.');
      } finally {
        setLoading(false);
      }
    }

    loadInviteDetails();
  }, [inviteId]);

  const handleSign = async () => {
    try {
      setSigning(true);
      const result = await submitSignedDocument(inviteId);
      
      if (result.success) {
        setSigned(true);
      } else {
        setError('Failed to sign the document. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while signing the document.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center" minH="60vh">
        <Spinner size="xl" />
        <Text mt={4} fontSize="lg">Loading document details...</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Box maxW="md" mx="auto" px={4} py={8}>
        <Box role="alert" bg="red.50" borderRadius="md" p={4} color="red.700">
          <Flex>
            <WarningIcon mr={3} />
            <VStack align="flex-start" gap={1}>
              <Heading size="sm">Error</Heading>
              <Text>{error}</Text>
            </VStack>
          </Flex>
        </Box>
        <Flex justify="center" mt={4}>
          <Button onClick={() => router.push('/')}>Return to Home</Button>
        </Flex>
      </Box>
    );
  }

  if (signed) {
    return (
      <Box maxW="md" mx="auto" px={4} py={8}>
        <Box borderWidth="1px" borderRadius="lg" overflow="hidden" p={6}>
          <Box>
            <Flex justify="center" mb={4}>
              <CheckCircleIcon w={16} h={16} color="green.500" />
            </Flex>
            <Heading size="md" textAlign="center">Document Signed!</Heading>
            <Text textAlign="center" color="gray.500">
              You have successfully signed the document.
            </Text>
          </Box>
          <Box display="flex" justifyContent="center" mt={6}>
            <Button onClick={() => router.push('/')}>Return to Home</Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box maxW="4xl" mx="auto" px={4} py={8}>
      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
        <Box p={6}>
          <Heading size="md">{inviteDetails?.contractName}</Heading>
          <Text color="gray.500">
            You have been invited by {inviteDetails?.senderName} to sign this document
          </Text>
        </Box>
        <Box p={6}>
          <Box 
            border="1px" 
            borderColor="gray.200" 
            borderRadius="md" 
            p={4} 
            mb={4} 
            minH="400px" 
            display="flex" 
            alignItems="center" 
            justifyContent="center"
          >
            {/* In a real implementation, this would be a document viewer component */}
            <Text textAlign="center" color="gray.500">
              Document preview would be displayed here.<br />
              In a production environment, integrate a PDF viewer or embed the document.
            </Text>
          </Box>
        </Box>
        <Box display="flex" justifyContent="space-between" p={6} borderTopWidth="1px">
          <Button variant="outline" onClick={() => router.push('/')}>Cancel</Button>
          <Button 
            onClick={handleSign} 
            disabled={signing}
            loading={signing}
            loadingText="Signing..."
            colorScheme="blue"
          >
            Sign Document
          </Button>
        </Box>
      </Box>
    </Box>
  );
} 