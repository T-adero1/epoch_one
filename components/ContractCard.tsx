'use client';

import { Box, Heading, Text, Badge, Button, HStack, VStack } from '@chakra-ui/react';
import { HiDocumentText, HiPencilAlt, HiTrash, HiMail } from 'react-icons/hi';

interface ContractCardProps {
  contract: {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  };
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSend: (id: string) => void;
}

export function ContractCard({ contract, onView, onEdit, onDelete, onSend }: ContractCardProps) {
  const { id, title, status, updatedAt } = contract;
  
  return (
    <Box 
      borderWidth="1px" 
      borderRadius="lg" 
      overflow="hidden" 
      p={4}
      shadow="sm"
      bg="white"
      transition="all 0.2s"
      _hover={{ shadow: 'md' }}
    >
      <HStack mb={3}>
        <Box 
          bg={status === 'active' ? 'green.100' : 'yellow.100'} 
          p={2} 
          borderRadius="md"
        >
          <HiDocumentText 
            size={20} 
            color={status === 'active' ? 'green' : 'orange'} 
          />
        </Box>
        <VStack align="flex-start" spacing={0}>
          <Heading size="sm" noOfLines={1} title={title}>
            {title}
          </Heading>
          <Text fontSize="xs" color="gray.500">
            Last updated: {updatedAt}
          </Text>
        </VStack>
      </HStack>
      
      <HStack justifyContent="space-between">
        <Badge colorScheme={status === 'active' ? 'green' : 'yellow'}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
        
        <HStack spacing={2}>
          <Button 
            size="xs"
            colorScheme="blue" 
            variant="ghost"
            leftIcon={<HiDocumentText />}
            onClick={() => onView(id)}
          >
            View
          </Button>
          <Button 
            size="xs"
            colorScheme="purple" 
            variant="ghost"
            leftIcon={<HiPencilAlt />}
            onClick={() => onEdit(id)}
          >
            Edit
          </Button>
          <Button 
            size="xs"
            colorScheme="green" 
            variant="ghost"
            leftIcon={<HiMail />}
            onClick={() => onSend(id)}
          >
            Send
          </Button>
          <Button 
            size="xs"
            colorScheme="red" 
            variant="ghost"
            leftIcon={<HiTrash />}
            onClick={() => onDelete(id)}
          >
            Delete
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
} 