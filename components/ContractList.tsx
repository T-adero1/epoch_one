'use client';

import { SimpleGrid, Box, Text, Button, Center, Spinner, VStack } from '@chakra-ui/react';
import { DocumentCard } from './DocumentCard';
import { HiPlus, HiDocumentText } from 'react-icons/hi';
import { useState } from 'react';

interface Document {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface DocumentListProps {
  documents?: Document[];
  isLoading?: boolean;
  error?: Error | null;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSend: (id: string) => void;
  onCreateNew: () => void;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
}

export function DocumentList({
  documents = [],
  isLoading = false,
  error = null,
  onView,
  onEdit,
  onDelete,
  onSend,
  onCreateNew,
  activeFilter = 'all',
  onFilterChange = () => {}
}: DocumentListProps) {

  // Filter documents if needed
  const filteredDocuments = documents.filter(document => {
    if (activeFilter === 'all') return true;
    return document.status === activeFilter;
  });

  if (isLoading) {
    return (
      <Center py={10}>
        <VStack>
          <Spinner size="xl" color="blue.500" />
          <Text mt={4}>Loading documents...</Text>
        </VStack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center py={10}>
        <VStack maxW="lg" textAlign="center">
          <Box
            p={3}
            bg="red.50"
            color="red.500"
            borderRadius="full"
            boxSize="16"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="3xl">!</Text>
          </Box>
          <Text fontWeight="medium" mt={4}>Error loading documents</Text>
          <Text color="gray.600" mb={2}>
            {error.message || 'Something went wrong. Please try again.'}
          </Text>
          
          {/* Display error details if available */}
          {(error as any).details && (
            <Box bg="red.50" p={3} borderRadius="md" my={2} w="full">
              <Text color="red.700" fontSize="sm" fontFamily="mono">
                {(error as any).details}
              </Text>
            </Box>
          )}
          
          {/* Display additional diagnostic information if available */}
          {(error as any).status && (
            <Text color="gray.500" fontSize="sm" mt={1}>
              Status code: {(error as any).status}
            </Text>
          )}
          
          {(error as any).info && (
            <Text color="gray.500" fontSize="sm" mt={1}>
              {(error as any).info}
            </Text>
          )}
          
          <Button mt={4} onClick={() => window.location.reload()}>
            Retry
          </Button>
        </VStack>
      </Center>
    );
  }

  if (!documents.length) {
    return (
      <Center py={10}>
        <VStack>
          <Box 
            p={3} 
            bg="blue.50" 
            color="blue.500" 
            borderRadius="full"
            boxSize="16"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <HiDocumentText size={32} />
          </Box>
          <Text fontWeight="medium" mt={4}>No documents found</Text>
          <Text color="gray.600" fontSize="sm">
            Create your first document to get started
          </Text>
          <Button 
            mt={4} 
            colorScheme="blue" 
            leftIcon={<HiPlus />}
            onClick={onCreateNew}
          >
            Create New Document
          </Button>
        </VStack>
      </Center>
    );
  }

  if (!filteredDocuments.length) {
    return (
      <Center py={10}>
        <VStack>
          <Box 
            p={3} 
            bg="orange.50" 
            color="orange.500" 
            borderRadius="full"
            boxSize="16"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <HiDocumentText size={32} />
          </Box>
          <Text fontWeight="medium" mt={4}>No matching documents</Text>
          <Text color="gray.600" fontSize="sm">
            No documents match the current filter
          </Text>
          <Button 
            mt={4} 
            colorScheme="blue" 
            variant="outline"
            onClick={() => onFilterChange('all')}
          >
            View All Documents
          </Button>
        </VStack>
      </Center>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6} w="full">
      {filteredDocuments.map(document => (
        <DocumentCard
          key={document.id}
          document={document}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onSend={onSend}
        />
      ))}
    </SimpleGrid>
  );
} 