/**
 * Invite Service
 * 
 * API service for handling document invites and signing operations.
 * This service encapsulates the API calls related to document signing workflow.
 */

import axios from 'axios';

// Types for invite-related data structures
export interface InviteData {
  document_hash: string;
  document_title: string;
  creator_address: string;
  ipfs_cid?: string;
  is_public?: boolean;
  created_at: number;
}

export interface CreateInviteParams {
  signer_email: string;
  document_hash: string;
  creator_sig: string;
  creator_address: string;
  document_title?: string;
  ipfs_cid?: string;
  is_public?: boolean;
  voucher_id: string;
}

export interface SubmitSignedParams {
  invite_id: string;
  signer_sig: string;
  signer_wallet_addr: string;
  signer_email: string;
}

export interface CreateInviteResponse {
  status: string;
  invite_id: string;
  email_sent: boolean;
  email_status: number;
}

export interface SubmitSignedResponse {
  status: string;
  tx_digest: string;
  contract_executed: boolean;
}

/**
 * Service for managing document invites and signing
 */
export const inviteService = {
  /**
   * Get invite details by ID
   * 
   * @param inviteId - The unique identifier for the invite
   * @returns Promise resolving to the invite data
   */
  async getInvite(inviteId: string): Promise<InviteData> {
    try {
      const response = await axios.get<InviteData>(`/api/invite/${inviteId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching invite data:', error);
      throw error;
    }
  },

  /**
   * Create a new document signing invitation
   * 
   * @param params - Parameters for creating the invite
   * @returns Promise resolving to the created invite details
   */
  async createInvite(params: CreateInviteParams): Promise<CreateInviteResponse> {
    try {
      const response = await axios.post<CreateInviteResponse>('/api/create_invite', params);
      return response.data;
    } catch (error) {
      console.error('Error creating invite:', error);
      throw error;
    }
  },

  /**
   * Submit a signed document
   * 
   * @param params - Parameters for submitting the signed document
   * @returns Promise resolving to the transaction result
   */
  async submitSigned(params: SubmitSignedParams): Promise<SubmitSignedResponse> {
    try {
      const response = await axios.post<SubmitSignedResponse>('/api/submit_signed', params);
      return response.data;
    } catch (error) {
      console.error('Error submitting signed document:', error);
      throw error;
    }
  },

  /**
   * Creates the message to sign for document signing
   * 
   * @param documentHash - The hash of the document to sign
   * @returns Formatted message ready to be signed
   */
  createSigningMessage(documentHash: string): string {
    // In a real implementation, you'd use the same prefix as in the Move contract
    return `EP_DOCUSIGN${documentHash}`;
  }
};

export default inviteService; 