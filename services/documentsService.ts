/**
 * Documents Service
 * 
 * API service for handling document operations such as uploading,
 * retrieving, signing, and verifying documents.
 */

import axios from 'axios';

// Types for document operations
export interface Document {
  id: string;
  title: string;
  description?: string;
  fileHash: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  status: 'draft' | 'pending' | 'signed' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
  signers?: DocumentSigner[];
  verifiers?: DocumentVerifier[];
}

export interface DocumentSigner {
  id: string;
  userId: string;
  walletAddress: string;
  status: 'pending' | 'signed';
  signedAt?: string;
  signature?: string;
}

export interface DocumentVerifier {
  id: string;
  userId: string;
  walletAddress: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  comment?: string;
}

export interface UploadDocumentParams {
  title: string;
  description?: string;
  file: File;
  signers?: string[]; // Array of wallet addresses
  verifiers?: string[]; // Array of wallet addresses
}

export interface SignDocumentParams {
  documentId: string;
  signature: string;
}

export interface VerifyDocumentParams {
  documentId: string;
  isVerified: boolean;
  comment?: string;
}

/**
 * Service for document operations
 */
export const documentsService = {
  /**
   * Upload a new document
   * 
   * @param params - Parameters for document upload
   * @returns Promise resolving to the created document
   */
  async uploadDocument(params: UploadDocumentParams): Promise<Document> {
    try {
      const formData = new FormData();
      formData.append('title', params.title);
      if (params.description) {
        formData.append('description', params.description);
      }
      formData.append('file', params.file);
      
      if (params.signers?.length) {
        params.signers.forEach((signer, index) => {
          formData.append(`signers[${index}]`, signer);
        });
      }
      
      if (params.verifiers?.length) {
        params.verifiers.forEach((verifier, index) => {
          formData.append(`verifiers[${index}]`, verifier);
        });
      }
      
      const response = await axios.post<Document>('/api/documents', formData, {
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
   * Get all documents for the current user
   * 
   * @param filter - Optional filter for document status
   * @returns Promise resolving to array of documents
   */
  async getUserDocuments(filter?: { status?: Document['status'] }): Promise<Document[]> {
    try {
      const queryParams = new URLSearchParams();
      if (filter?.status) {
        queryParams.append('status', filter.status);
      }
      
      const url = `/api/documents?${queryParams.toString()}`;
      const response = await axios.get<Document[]>(url);
      return response.data;
    } catch (error) {
      console.error('Error getting user documents:', error);
      throw error;
    }
  },

  /**
   * Get documents waiting for signature from the current user
   * 
   * @returns Promise resolving to array of documents
   */
  async getPendingSignatureDocuments(): Promise<Document[]> {
    try {
      const response = await axios.get<Document[]>('/api/documents/pending-signature');
      return response.data;
    } catch (error) {
      console.error('Error getting pending signature documents:', error);
      throw error;
    }
  },

  /**
   * Get documents waiting for verification from the current user
   * 
   * @returns Promise resolving to array of documents
   */
  async getPendingVerificationDocuments(): Promise<Document[]> {
    try {
      const response = await axios.get<Document[]>('/api/documents/pending-verification');
      return response.data;
    } catch (error) {
      console.error('Error getting pending verification documents:', error);
      throw error;
    }
  },

  /**
   * Get a specific document by ID
   * 
   * @param documentId - The ID of the document to retrieve
   * @returns Promise resolving to the document
   */
  async getDocument(documentId: string): Promise<Document> {
    try {
      const response = await axios.get<Document>(`/api/documents/${documentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting document ${documentId}:`, error);
      throw error;
    }
  },

  /**
   * Sign a document
   * 
   * @param params - Parameters for signing the document
   * @returns Promise resolving to the updated document
   */
  async signDocument(params: SignDocumentParams): Promise<Document> {
    try {
      const response = await axios.post<Document>(`/api/documents/${params.documentId}/sign`, {
        signature: params.signature
      });
      return response.data;
    } catch (error) {
      console.error(`Error signing document ${params.documentId}:`, error);
      throw error;
    }
  },

  /**
   * Verify or reject a document
   * 
   * @param params - Parameters for verifying the document
   * @returns Promise resolving to the updated document
   */
  async verifyDocument(params: VerifyDocumentParams): Promise<Document> {
    try {
      const response = await axios.post<Document>(`/api/documents/${params.documentId}/verify`, {
        isVerified: params.isVerified,
        comment: params.comment
      });
      return response.data;
    } catch (error) {
      console.error(`Error verifying document ${params.documentId}:`, error);
      throw error;
    }
  },

  /**
   * Calculate hash for a file
   * 
   * @param file - The file to hash
   * @returns Promise resolving to the hash of the file
   */
  async calculateFileHash(file: File): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post<{ hash: string }>('/api/documents/calculate-hash', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      return response.data.hash;
    } catch (error) {
      console.error('Error calculating file hash:', error);
      throw error;
    }
  }
};

export default documentsService; 