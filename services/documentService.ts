/**
 * Document Service
 * 
 * API service for handling document operations including fetching, 
 * uploading, and managing document metadata.
 */

import axios from 'axios';

// Document-related types
export interface DocumentMetadata {
  id: string;
  title: string;
  hash: string;
  creator_address: string;
  status: 'draft' | 'pending' | 'signed' | 'rejected';
  created_at: number;
  updated_at: number;
  ipfs_cid?: string;
  is_public: boolean;
  signers?: SignerInfo[];
}

export interface SignerInfo {
  email: string;
  wallet_address?: string;
  signed_at?: number;
  status: 'pending' | 'signed' | 'rejected';
}

export interface UploadDocumentResponse {
  document_id: string;
  hash: string;
  ipfs_cid?: string;
  status: string;
}

export interface UploadParams {
  file: File;
  title: string;
  creator_address: string;
  is_public?: boolean;
}

/**
 * Service for document operations
 */
export const documentService = {
  /**
   * Fetch all documents for a user
   * 
   * @param walletAddress - The wallet address of the user
   * @returns Promise resolving to an array of document metadata
   */
  async getUserDocuments(walletAddress: string): Promise<DocumentMetadata[]> {
    try {
      const response = await axios.get<DocumentMetadata[]>(`/api/documents?wallet=${walletAddress}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user documents:', error);
      throw error;
    }
  },

  /**
   * Get a single document by ID
   * 
   * @param documentId - The ID of the document to retrieve
   * @returns Promise resolving to the document metadata
   */
  async getDocument(documentId: string): Promise<DocumentMetadata> {
    try {
      const response = await axios.get<DocumentMetadata>(`/api/documents/${documentId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching document:', error);
      throw error;
    }
  },

  /**
   * Upload a new document
   * 
   * @param params - Upload parameters including file and metadata
   * @returns Promise resolving to the upload response
   */
  async uploadDocument(params: UploadParams): Promise<UploadDocumentResponse> {
    try {
      const formData = new FormData();
      formData.append('file', params.file);
      formData.append('title', params.title);
      formData.append('creator_address', params.creator_address);
      
      if (params.is_public !== undefined) {
        formData.append('is_public', String(params.is_public));
      }

      const response = await axios.post<UploadDocumentResponse>('/api/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  },

  /**
   * Delete a document
   * 
   * @param documentId - The ID of the document to delete
   * @returns Promise resolving to a success status
   */
  async deleteDocument(documentId: string): Promise<{ success: boolean }> {
    try {
      const response = await axios.delete<{ success: boolean }>(`/api/documents/${documentId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  },

  /**
   * Get document content (binary data)
   * 
   * @param documentId - The ID of the document to retrieve content for
   * @returns Promise resolving to a Blob containing the document data
   */
  async getDocumentContent(documentId: string): Promise<Blob> {
    try {
      const response = await axios.get(`/api/documents/${documentId}/content`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching document content:', error);
      throw error;
    }
  },

  /**
   * Calculate hash of a document file
   * 
   * @param file - The document file to hash
   * @returns Promise resolving to the document hash
   */
  async calculateFileHash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          resolve(hashHex);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
};

export default documentService; 