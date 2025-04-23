'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { 
  Box, 
  Container, 
  Heading, 
  Text, 
  Flex, 
  Button, 
  ButtonGroup, 
  useToast,
  VStack,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel
} from '@chakra-ui/react';
import { HiPlus } from 'react-icons/hi';
import { ContractList } from '@/components/ContractList';

// Fetcher function for SWR
const fetcher = async (url: string) => {
  console.log('Fetching data from:', url);
  const response = await fetch(url);
  
  if (!response.ok) {
    // Try to parse error details from the response if possible
    let errorMessage = `API error: ${response.status}`;
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
    } catch (parseError) {
      console.error('Failed to parse error response:', parseError);
    }
    
    const error: any = new Error(errorMessage);
    error.status = response.status;
    error.details = errorDetails;
    error.info = `Failed to fetch from ${url}`;
    console.error('API request failed:', errorMessage, error);
    throw error;
  }
  
  return response.json();
};

export default function ContractsPage() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const { data, error, isLoading, mutate } = useSWR('/api/contracts', fetcher, {
    onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
      // Only retry up to 3 times
      if (retryCount >= 3) return;
      setTimeout(() => revalidate({ retryCount }), 3000);
    },
  });

  // Handle contract actions
  const handleView = (id: string) => {
    router.push(`/contracts/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/contracts/${id}/edit`);
  };

  const handleSend = (id: string) => {
    // Open send modal or navigate to send page
    router.push(`/contracts/${id}/send`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contract?')) {
      return;
    }

    try {
      const response = await fetch(`/api/contracts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete contract');
      }

      toast({
        title: 'Contract deleted',
        description: 'Contract was successfully deleted',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Refresh the data
      mutate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete contract',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleCreateNew = () => {
    router.push('/contracts/new');
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="lg">Contracts</Heading>
            <Text color="gray.600">Manage and sign your legal documents</Text>
          </Box>
          <Button 
            colorScheme="blue"
            leftIcon={<HiPlus />}
            onClick={handleCreateNew}
          >
            New Contract
          </Button>
        </Flex>

        <Tabs colorScheme="blue" onChange={(index) => {
          const filters = ['all', 'active', 'draft'];
          setFilter(filters[index]);
        }}>
          <TabList>
            <Tab>All Contracts</Tab>
            <Tab>Active</Tab>
            <Tab>Drafts</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <ContractList
                contracts={data}
                isLoading={isLoading}
                error={error}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSend={handleSend}
                onCreateNew={handleCreateNew}
                activeFilter={filter}
                onFilterChange={setFilter}
              />
            </TabPanel>
            <TabPanel>
              <ContractList
                contracts={data}
                isLoading={isLoading}
                error={error}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSend={handleSend}
                onCreateNew={handleCreateNew}
                activeFilter={filter}
                onFilterChange={setFilter}
              />
            </TabPanel>
            <TabPanel>
              <ContractList
                contracts={data}
                isLoading={isLoading}
                error={error}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSend={handleSend}
                onCreateNew={handleCreateNew}
                activeFilter={filter}
                onFilterChange={setFilter}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </VStack>
    </Container>
  );
} 