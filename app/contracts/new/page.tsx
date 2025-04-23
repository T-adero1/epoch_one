'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Textarea,
  VStack,
  useToast,
  FormErrorMessage,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Flex
} from '@chakra-ui/react';
import { HiChevronRight } from 'react-icons/hi';
import Link from 'next/link';

export default function NewContractPage() {
  const router = useRouter();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    title: '',
    status: 'draft',
    content: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when field is edited
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    
    try {
      console.log('Submitting contract form:', formData);
      
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        const errorMessage = responseData.error || 'Failed to create contract';
        console.error(`Contract creation failed (${response.status}):`, errorMessage);
        throw new Error(errorMessage);
      }
      
      console.log('Contract created successfully:', responseData);
      
      toast({
        title: 'Contract created',
        description: 'Your contract has been created successfully.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Redirect to the new contract
      router.push(`/contracts/${responseData.contract.id}`);
    } catch (error) {
      console.error('Error creating contract:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create contract. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={8} align="stretch">
        <Breadcrumb 
          separator={<HiChevronRight color="gray.500" />}
          fontSize="sm"
        >
          <BreadcrumbItem>
            <BreadcrumbLink as={Link} href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink as={Link} href="/contracts">Contracts</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>
            <BreadcrumbLink>New Contract</BreadcrumbLink>
          </BreadcrumbItem>
        </Breadcrumb>
        
        <Heading size="lg">Create New Contract</Heading>
        
        <Box
          as="form"
          onSubmit={handleSubmit}
          border="1px"
          borderColor="gray.200"
          borderRadius="lg"
          p={6}
          bg="white"
          shadow="sm"
        >
          <VStack spacing={4} align="stretch">
            <FormControl isRequired isInvalid={!!errors.title}>
              <FormLabel>Title</FormLabel>
              <Input
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter contract title"
              />
              {errors.title && <FormErrorMessage>{errors.title}</FormErrorMessage>}
            </FormControl>
            
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </Select>
            </FormControl>
            
            <FormControl>
              <FormLabel>Content</FormLabel>
              <Textarea
                name="content"
                value={formData.content}
                onChange={handleChange}
                placeholder="Enter contract content or terms"
                minH="200px"
              />
            </FormControl>
            
            <Flex justify="flex-end" mt={4} gap={4}>
              <Button 
                variant="outline" 
                onClick={() => router.push('/contracts')}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                colorScheme="blue"
                isLoading={isSubmitting}
                loadingText="Creating..."
              >
                Create Contract
              </Button>
            </Flex>
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
} 