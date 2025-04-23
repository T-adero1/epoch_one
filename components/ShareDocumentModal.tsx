'use client';

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Flex, 
  Heading, 
  Text, 
  VStack, 
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Textarea
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useRouter } from 'next/navigation';

interface ShareDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId?: string;
  documentTitle?: string;
}

export const ShareDocumentModal: React.FC<ShareDocumentModalProps> = ({ 
  isOpen, 
  onClose, 
  documentId,
  documentTitle = 'Untitled Document'
}) => {
  const router = useRouter();
  const { toast } = useToast();
  
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recipientEmail) {
      toast({
        title: 'Error',
        description: 'Please enter the recipient\'s email address',
        status: 'error',
      });
      return;
    }
    
    if (!documentId) {
      toast({
        title: 'Error',
        description: 'No document selected to share',
        status: 'error',
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log(`Creating share invite for document: ${documentId}, recipient: ${recipientEmail}`);
      
      // Call the real invite API
      const response = await fetch('/api/invite/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          documentTitle,
          recipientEmail,
          recipientName: recipientEmail.split('@')[0], // Simple fallback
          expiresIn: 30, // Expire in 30 days
          message: message || undefined,
          isPublic,
          canEdit
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }
      
      console.log('Invitation created successfully:', data);
      
      // Get the URL from the API response
      const shareLink = data.viewUrl;
      setGeneratedLink(shareLink);
      
      toast({
        title: 'Success',
        description: `Invitation sent to ${recipientEmail}`,
        status: 'success',
      });
      
      // Copy link to clipboard
      await navigator.clipboard.writeText(shareLink);
      toast({
        title: 'Link Copied',
        description: 'Share link has been copied to clipboard',
        status: 'info',
      });
      
      // Reset form and close modal
      setRecipientEmail('');
      setMessage('');
      setIsPublic(false);
      setCanEdit(false);
      onClose();
      
      // Redirect to dashboard with success message
      router.push('/dashboard?status=shared');
      
    } catch (error) {
      console.error('Failed to share document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to share document. Please try again.',
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent maxW="500px">
        <ModalHeader bg="blue.50" borderTopRadius="md">
          <Heading size="md">Share Document</Heading>
          <ModalCloseButton position="absolute" right="3" top="3" />
        </ModalHeader>
            
        <form onSubmit={handleSubmit}>
          <ModalBody py={6} px={6}>
            <VStack gap={4} align="stretch">
              <Box bg="blue.50" p={4} borderRadius="md">
                <Text fontWeight="medium">{documentTitle}</Text>
                <Text fontSize="sm" color="gray.600">
                  {documentId ? `Document ID: ${documentId}` : 'New document'}
                </Text>
              </Box>
                  
              <FormControl isRequired>
                <FormLabel>Recipient Email</FormLabel>
                <Input 
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)} 
                  placeholder="Enter recipient's email address"
                />
              </FormControl>
                  
              <FormControl>
                <FormLabel>Personal Message (Optional)</FormLabel>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a personal message to the recipient"
                  minH="100px"
                  p={2}
                />
              </FormControl>
                  
              <Box>
                <Flex align="center" mb={2}>
                  <input 
                    type="checkbox" 
                    id="isPublic"
                    checked={isPublic} 
                    onChange={(e) => setIsPublic(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  <Text>Make this document publicly viewable</Text>
                </Flex>
                <Flex align="center">
                  <input 
                    type="checkbox" 
                    id="canEdit"
                    checked={canEdit} 
                    onChange={(e) => setCanEdit(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  <Text>Allow recipient to edit this document</Text>
                </Flex>
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Control access permissions for the recipient.
                </Text>
              </Box>
            </VStack>
          </ModalBody>
              
          <ModalFooter borderTop="1px" borderColor="gray.100" p={4}>
            <Button variant="outline" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit"
              colorScheme="blue"
              isLoading={isLoading}
              loadingText="Sharing..."
            >
              Share Document
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ShareDocumentModal; 