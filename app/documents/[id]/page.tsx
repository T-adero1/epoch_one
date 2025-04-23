'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Divider,
  Badge,
  Card,
  CardHeader,
  CardBody,
  Spinner,
  Icon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure
} from '@chakra-ui/react';
import { 
  CheckCircleIcon, 
  TimeIcon, 
  WarningIcon, 
  EmailIcon, 
  DownloadIcon,
  ArrowBackIcon
} from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';

// Mock document data - would come from API in real implementation
const getMockDocument = (id: string) => {
  const mockDocuments = {
    doc1: {
      id: 'doc1',
      title: 'Employment Contract',
      createdAt: new Date('2023-10-15').getTime(),
      status: 'signed',
      recipientEmail: 'employee@example.com',
      signedAt: new Date('2023-10-17').getTime(),
      signerName: 'John Doe',
      documentType: 'PDF',
      fileSize: '1.2 MB',
      expiresAt: new Date('2023-11-15').getTime(),
      createdBy: 'HR Department',
      signatureMethod: 'Electronic Signature',
      history: [
        { action: 'Document created', timestamp: new Date('2023-10-15').getTime() },
        { action: 'Invite sent', timestamp: new Date('2023-10-15').getTime() + 5 * 60 * 1000 },
        { action: 'Document viewed', timestamp: new Date('2023-10-16').getTime() },
        { action: 'Document signed', timestamp: new Date('2023-10-17').getTime() }
      ]
    },
    doc2: {
      id: 'doc2',
      title: 'NDA Agreement',
      createdAt: new Date('2023-11-01').getTime(),
      status: 'pending',
      recipientEmail: 'partner@example.com',
      documentType: 'PDF',
      fileSize: '0.8 MB',
      expiresAt: new Date('2023-12-01').getTime(),
      createdBy: 'Legal Team',
      signatureMethod: 'Electronic Signature',
      history: [
        { action: 'Document created', timestamp: new Date('2023-11-01').getTime() },
        { action: 'Invite sent', timestamp: new Date('2023-11-01').getTime() + 10 * 60 * 1000 }
      ]
    },
    doc3: {
      id: 'doc3',
      title: 'Sales Contract',
      createdAt: new Date('2023-11-10').getTime(),
      status: 'expired',
      recipientEmail: 'client@example.com',
      documentType: 'PDF',
      fileSize: '1.5 MB',
      expiresAt: new Date('2023-11-17').getTime(),
      createdBy: 'Sales Department',
      signatureMethod: 'Electronic Signature',
      history: [
        { action: 'Document created', timestamp: new Date('2023-11-10').getTime() },
        { action: 'Invite sent', timestamp: new Date('2023-11-10').getTime() + 15 * 60 * 1000 },
        { action: 'Invite expired', timestamp: new Date('2023-11-17').getTime() }
      ]
    }
  };

  return mockDocuments[id as keyof typeof mockDocuments];
};

interface HistoryItem {
  action: string;
  timestamp: number;
}

interface Document {
  id: string;
  title: string;
  createdAt: number;
  status: 'pending' | 'signed' | 'expired';
  recipientEmail: string;
  documentType: string;
  fileSize: string;
  expiresAt: number;
  createdBy: string;
  signatureMethod: string;
  history: HistoryItem[];
  signedAt?: number;
  signerName?: string;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  
  useEffect(() => {
    const fetchDocument = async () => {
      try {
        setLoading(true);
        
        // In real implementation, this would fetch from API
        // For demo, use mock data
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const doc = getMockDocument(params.id as string);
        if (!doc) {
          toast({
            title: 'Document not found',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
          router.push('/documents');
          return;
        }
        
        setDocument(doc);
      } catch (error) {
        console.error('Error fetching document:', error);
        toast({
          title: 'Error loading document',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    
    if (params.id) {
      fetchDocument();
    }
  }, [params.id, router, toast]);
  
  const handleResendInvite = async () => {
    if (!document) return;
    
    try {
      setResending(true);
      
      // In real implementation, this would call API
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update the document with new expiry and history
      const newExpiryDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now
      setDocument(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          status: 'pending',
          expiresAt: newExpiryDate,
          history: [
            ...prev.history,
            { action: 'Invite resent', timestamp: Date.now() }
          ]
        };
      });
      
      toast({
        title: 'Invitation resent',
        description: `A new invite has been sent to ${document.recipientEmail}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error resending invitation',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setResending(false);
    }
  };
  
  const getStatusInfo = () => {
    if (!document) return null;
    
    switch (document.status) {
      case 'signed':
        return {
          icon: CheckCircleIcon,
          color: 'green.500',
          badge: <Badge colorScheme="green">Signed</Badge>,
          text: `Signed by ${document.signerName} on ${new Date(document.signedAt || 0).toLocaleString()}`
        };
      case 'pending':
        const isExpiringSoon = document.expiresAt < Date.now() + 2 * 24 * 60 * 60 * 1000; // 2 days
        return {
          icon: isExpiringSoon ? TimeIcon : EmailIcon,
          color: isExpiringSoon ? 'orange.500' : 'blue.500',
          badge: <Badge colorScheme={isExpiringSoon ? 'orange' : 'blue'}>
            {isExpiringSoon ? 'Expiring Soon' : 'Pending'}
          </Badge>,
          text: `Expires on ${new Date(document.expiresAt).toLocaleString()}`
        };
      case 'expired':
        return {
          icon: WarningIcon,
          color: 'red.500',
          badge: <Badge colorScheme="red">Expired</Badge>,
          text: `Expired on ${new Date(document.expiresAt).toLocaleString()}`
        };
      default:
        return {
          icon: WarningIcon,
          color: 'gray.500',
          badge: <Badge>Unknown</Badge>,
          text: 'Unknown status'
        };
    }
  };
  
  if (loading) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack spacing={4}>
          <Spinner size="xl" />
          <Text>Loading document details...</Text>
        </VStack>
      </Flex>
    );
  }
  
  if (!document) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack spacing={4}>
          <WarningIcon boxSize={10} color="red.500" />
          <Heading size="md">Document Not Found</Heading>
          <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/documents')}>
            Back to Documents
          </Button>
        </VStack>
      </Flex>
    );
  }
  
  const statusInfo = getStatusInfo();
  
  return (
    <Box p={5} maxW="1200px" mx="auto">
      <HStack mb={5} spacing={4}>
        <Button 
          leftIcon={<ArrowBackIcon />} 
          variant="outline" 
          onClick={() => router.push('/documents')}
        >
          Back to Documents
        </Button>
        
        {document.status === 'signed' && (
          <Button 
            leftIcon={<DownloadIcon />} 
            colorScheme="blue"
            onClick={onOpen}
          >
            Download Signed Document
          </Button>
        )}
        
        {(document.status === 'pending' || document.status === 'expired') && (
          <Button 
            leftIcon={<EmailIcon />} 
            colorScheme="blue"
            isLoading={resending}
            loadingText="Resending..."
            onClick={handleResendInvite}
          >
            Resend Invitation
          </Button>
        )}
      </HStack>
      
      <Flex 
        direction={{ base: 'column', md: 'row' }} 
        gap={6}
      >
        {/* Document details card */}
        <Box flex="1">
          <Card shadow="md" mb={6}>
            <CardHeader bg="gray.50" p={4}>
              <Flex justify="space-between" align="center">
                <Heading size="md">{document.title}</Heading>
                {statusInfo?.badge}
              </Flex>
            </CardHeader>
            <CardBody p={4}>
              <VStack align="stretch" spacing={4}>
                <Flex align="center">
                  <Icon as={statusInfo?.icon} color={statusInfo?.color} boxSize={5} mr={2} />
                  <Text>{statusInfo?.text}</Text>
                </Flex>
                
                <Divider />
                
                <Box>
                  <Text fontWeight="bold" mb={1}>Document Details</Text>
                  <HStack spacing={6} flexWrap="wrap">
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Type</Text>
                      <Text>{document.documentType}</Text>
                    </Box>
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Size</Text>
                      <Text>{document.fileSize}</Text>
                    </Box>
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Created</Text>
                      <Text>{new Date(document.createdAt).toLocaleDateString()}</Text>
                    </Box>
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Created By</Text>
                      <Text>{document.createdBy}</Text>
                    </Box>
                  </HStack>
                </Box>
                
                <Divider />
                
                <Box>
                  <Text fontWeight="bold" mb={1}>Recipient Information</Text>
                  <HStack spacing={6} flexWrap="wrap">
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Email</Text>
                      <Text>{document.recipientEmail}</Text>
                    </Box>
                    {document.status === 'signed' && (
                      <Box minW="200px">
                        <Text color="gray.500" fontSize="sm">Signer Name</Text>
                        <Text>{document.signerName}</Text>
                      </Box>
                    )}
                    <Box minW="200px">
                      <Text color="gray.500" fontSize="sm">Signature Method</Text>
                      <Text>{document.signatureMethod}</Text>
                    </Box>
                  </HStack>
                </Box>
              </VStack>
            </CardBody>
          </Card>
        </Box>
        
        {/* Document history */}
        <Box width={{ base: '100%', md: '350px' }}>
          <Card shadow="md">
            <CardHeader bg="gray.50" p={4}>
              <Heading size="md">Document History</Heading>
            </CardHeader>
            <CardBody p={0}>
              <VStack align="stretch" spacing={0} divider={<Divider />}>
                {document.history.map((item, index) => (
                  <Box key={index} p={4}>
                    <Text fontWeight="medium">{item.action}</Text>
                    <Text fontSize="sm" color="gray.500">
                      {new Date(item.timestamp).toLocaleString()}
                    </Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        </Box>
      </Flex>
      
      {/* Download Document Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Download Signed Document</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              You are about to download the signed copy of "{document.title}".
              This document contains a legally binding signature.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button 
              colorScheme="blue" 
              leftIcon={<DownloadIcon />}
              onClick={() => {
                onClose();
                toast({
                  title: 'Document downloaded',
                  status: 'success',
                  duration: 3000,
                  isClosable: true,
                });
              }}
            >
              Download
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
} 