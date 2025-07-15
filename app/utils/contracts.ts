import { Contract, ContractStatus, SignatureStatus } from '@prisma/client';

export interface ContractWithRelations extends Contract {
  signatures: {
    id: string;
    status: SignatureStatus;
    signedAt: Date | null;
    userGoogleIdHash: string;
    email: string | null;
    walletAddress: string;
  }[];
}

export const getContracts = async (userGoogleIdHash: string, status?: ContractStatus) => {
  const params = new URLSearchParams();
  params.append('userGoogleIdHash', userGoogleIdHash);
  if (status) params.append('status', status);

  const response = await fetch(`/api/contracts?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch contracts');
  return response.json() as Promise<ContractWithRelations[]>;
};

export const createContract = async (data: {
  title: string;
  description?: string;
  content: string;
  ownerGoogleIdHash: string; // Already hashed
  signerGoogleIdHashes?: string[]; // Already hashed Google IDs
  metadata?: {
    [key: string]: any;
  };
}) => {
  const response = await fetch('/api/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      content: data.content,
      ownerGoogleIdHash: data.ownerGoogleIdHash,
      metadata: {
        ...data.metadata,
        signers: data.signerGoogleIdHashes || [], // Store hashed Google IDs in signers array
      },
    }),
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