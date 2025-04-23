'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Box, 
  Button, 
  Flex, 
  Heading, 
  Text, 
  VStack, 
  HStack, 
  Table, 
  Thead, 
  Tbody, 
  Tr, 
  Th, 
  Td, 
  Badge, 
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Spinner
} from '@chakra-ui/react';
import { AddIcon, ViewIcon, EmailIcon } from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';

// Mock data for documents (in a real app this would come from API)
const mockDocuments = [
  {
    id: 'doc1',
    title: 'Employment Contract',
    createdAt: new Date('2023-10-15').getTime(),
    status: 'signed',
    recipientEmail: 'employee@example.com',
    signedAt: new Date('2023-10-17').getTime(),
    signerName: 'John Doe'
  },
  {
    id: 'doc2',
    title: 'NDA Agreement',
    createdAt: new Date('2023-11-01').getTime(),
    status: 'pending',
    recipientEmail: 'partner@example.com',
    expiresAt: new Date('2023-12-01').getTime()
  },
  {
    id: 'doc3',
    title: 'Sales Contract',
    createdAt: new Date('2023-11-10').getTime(),
    status: 'expired',
    recipientEmail: 'client@example.com',
    expiresAt: new Date('2023-11-17').getTime()
  }
];

interface Document {
  id: string;
  title: string;
  createdAt: number;
  status: 'pending' | 'signed' | 'expired';
  recipientEmail: string;
  expiresAt?: number;
  signedAt?: number;
  signerName?: string;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newDocument, setNewDocument] = useState({
    title: '',
    recipientEmail: ''
  });
  
  useEffect(() => {
    // In a real app, fetch documents from API
    // For demo, use mock data
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        setDocuments(mockDocuments);
      } catch (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: 'Error fetching documents',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchDocuments();
  }, [toast]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewDocument(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleCreateDocument = async () => {
    if (!newDocument.title || !newDocument.recipientEmail) {
      toast({
        title: 'Please fill in all fields',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    try {
      setCreating(true);
      
      // In a real app, make API call to create document
      // Simulating API call and success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newDoc: Document = {
        id: `doc${Date.now()}`,
        title: newDocument.title,
        createdAt: Date.now(),
        status: 'pending',
        recipientEmail: newDocument.recipientEmail,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      };
      
      setDocuments(prev => [newDoc, ...prev]);
      
      toast({
        title: 'Document created',
        description: `Invite sent to ${newDocument.recipientEmail}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Reset form and close modal
      setNewDocument({
        title: '',
        recipientEmail: ''
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Error creating document',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setCreating(false);
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'signed':
        return <Badge colorScheme="green">Signed</Badge>;
      case 'pending':
        return <Badge colorScheme="blue">Pending</Badge>;
      case 'expired':
        return <Badge colorScheme="red">Expired</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };
  
  const resendInvite = async (docId: string, email: string) => {
    toast({
      title: 'Invite resent',
      description: `A new invitation has been sent to ${email}`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };
  
  if (loading) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack spacing={4}>
          <Spinner size="xl" />
          <Text>Loading documents...</Text>
        </VStack>
      </Flex>
    );
  }
  
  return (
    <Box p={5} maxW="1200px" mx="auto">
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg">Document Management</Heading>
        <Button 
          leftIcon={<AddIcon />} 
          colorScheme="blue"
          onClick={onOpen}
        >
          New Document
        </Button>
      </Flex>
      
      {documents.length === 0 ? (
        <Box textAlign="center" p={10} bg="gray.50" borderRadius="md">
          <Text mb={4}>You haven't created any documents yet</Text>
          <Button colorScheme="blue" onClick={onOpen}>Create Your First Document</Button>
        </Box>
      ) : (
        <Box overflowX="auto">
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Document Title</Th>
                <Th>Recipient</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {documents.map((doc) => (
                <Tr key={doc.id}>
                  <Td fontWeight="medium">{doc.title}</Td>
                  <Td>{doc.recipientEmail}</Td>
                  <Td>{new Date(doc.createdAt).toLocaleDateString()}</Td>
                  <Td>{getStatusBadge(doc.status)}</Td>
                  <Td>
                    <HStack spacing={2}>
                      <IconButton
                        aria-label="View document"
                        icon={<ViewIcon />}
                        size="sm"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                      />
                      {doc.status === 'pending' && (
                        <IconButton
                          aria-label="Resend invite"
                          icon={<EmailIcon />}
                          size="sm"
                          colorScheme="blue"
                          onClick={() => resendInvite(doc.id, doc.recipientEmail)}
                        />
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
      
      {/* Create Document Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create New Document</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Document Title</FormLabel>
                <Input 
                  name="title"
                  value={newDocument.title}
                  onChange={handleInputChange}
                  placeholder="Enter document title"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Recipient Email</FormLabel>
                <Input 
                  name="recipientEmail"
                  value={newDocument.recipientEmail}
                  onChange={handleInputChange}
                  placeholder="Enter recipient email"
                  type="email"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button 
              colorScheme="blue" 
              onClick={handleCreateDocument}
              isLoading={creating}
              loadingText="Creating..."
            >
              Create & Send
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
} 