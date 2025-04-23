/**
 * Services Index
 * 
 * This file aggregates and exports all service modules to provide a central
 * access point for frontend API clients.
 */

// Export all services
export { default as inviteService } from './inviteService';
export { default as documentService } from './documentService';
export { default as walletService } from './walletService';
export { default as userService } from './userService';
export { default as documentsService } from './documentsService';

// Export types from each service
export type {
  // Invite Service Types
  InviteData,
  CreateInviteParams,
  SubmitSignedParams,
  CreateInviteResponse,
  SubmitSignedResponse,
} from './inviteService';

export type {
  // Document Service Types
  DocumentMetadata,
  SignerInfo,
  UploadDocumentResponse,
  UploadParams,
} from './documentService';

export type {
  // Wallet Service Types
  WalletInfo,
  SignatureRequest,
  SignatureResponse,
  TransactionRequest,
  TransactionResponse,
} from './walletService';

export type {
  // User Service Types
  UserProfile,
  UpdateProfileParams,
  AuthResponse,
} from './userService';

export type {
  // Documents Service Types
  Document,
  DocumentSigner,
  DocumentVerifier,
  UploadDocumentParams,
  SignDocumentParams,
  VerifyDocumentParams,
} from './documentsService'; 