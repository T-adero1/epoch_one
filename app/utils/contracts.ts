import { Contract, ContractStatus, SignatureStatus } from '@prisma/client';

export interface ContractWithRelations extends Contract {
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures: {
    id: string;
    status: SignatureStatus;
    signedAt: Date | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
}

export const getContracts = async (userId?: string, status?: ContractStatus) => {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (status) params.append('status', status);

  const response = await fetch(`/api/contracts?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch contracts');
  return response.json() as Promise<ContractWithRelations[]>;
};

export const createContract = async (data: {
  title: string;
  description?: string;
  content: string;
  ownerId: string;
  metadata?: {
    signers?: string[];
  };
}) => {
  const response = await fetch('/api/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create contract');
  return response.json() as Promise<ContractWithRelations>;
};

export const updateContract = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    content?: string;
    status?: ContractStatus;
    metadata?: {
      signers?: string[];
    };
  }
) => {
  const response = await fetch('/api/contracts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
  if (!response.ok) throw new Error('Failed to update contract');
  return response.json() as Promise<ContractWithRelations>;
};

export const deleteContract = async (id: string) => {
  const response = await fetch(`/api/contracts?id=${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete contract');
  return response.json();
};

export const signContract = async (data: {
  contractId: string;
  userId: string;
  walletAddress: string;
  signature: string;
}) => {
  const response = await fetch('/api/signatures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to sign contract');
  return response.json();
};

export const getContractSignatures = async (contractId: string) => {
  const response = await fetch(`/api/signatures?contractId=${contractId}`);
  if (!response.ok) throw new Error('Failed to fetch signatures');
  return response.json();
}; 