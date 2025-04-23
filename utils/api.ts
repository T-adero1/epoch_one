import axios from 'axios';
import { 
  CreateInviteRequest, 
  CreateInviteResponse,
  SubmitSignedRequest,
  SubmitSignedResponse,
  SponsorTxRequest,
  SponsorTxResponse,
  GetInviteResponse
} from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.epochone.com/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create a document signing invitation
export const createInvite = async (data: CreateInviteRequest): Promise<CreateInviteResponse> => {
  try {
    const response = await api.post<CreateInviteResponse>('/invites', data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as CreateInviteResponse;
    }
    return { 
      success: false, 
      error: 'Failed to create invitation. Please try again.' 
    };
  }
};

// Submit a signed contract
export const submitSignedContract = async (data: SubmitSignedRequest): Promise<SubmitSignedResponse> => {
  try {
    const response = await api.post<SubmitSignedResponse>('/contracts/submit', data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SubmitSignedResponse;
    }
    return { 
      success: false, 
      error: 'Failed to submit signed contract. Please try again.' 
    };
  }
};

// Get invitation data by ID
export const getInviteById = async (inviteId: string): Promise<GetInviteResponse> => {
  try {
    const response = await api.get<GetInviteResponse>(`/invites/${inviteId}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as GetInviteResponse;
    }
    return { 
      success: false, 
      error: 'Failed to retrieve invitation data.' 
    };
  }
};

// Upload document to IPFS
export const uploadToIPFS = async (file: File): Promise<{ success: boolean; cid?: string; error?: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/storage/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return {
      success: true,
      cid: response.data.cid,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return {
        success: false,
        error: error.response.data.message || 'Failed to upload document',
      };
    }
    return {
      success: false,
      error: 'Failed to upload document to storage',
    };
  }
};

// Sponsor a transaction
export const sponsorTransaction = async (data: SponsorTxRequest): Promise<SponsorTxResponse> => {
  try {
    const response = await api.post<SponsorTxResponse>('/transactions/sponsor', data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SponsorTxResponse;
    }
    return { 
      success: false, 
      error: 'Failed to sponsor transaction. Please try again.' 
    };
  }
};

export default api; 