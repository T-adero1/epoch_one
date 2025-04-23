// Interface for document invitation data
export interface InviteData {
  invite_id: string;
  signer_email_hash: string;
  document_hash: string;
  creator_sig: string;
  creator_address: string;
  document_title: string;
  ipfs_cid: string;
  is_public: boolean;
  voucher_id: string;
  created_at: number;
  expires_at: number;
}

// Interface for create invite request
export interface CreateInviteRequest {
  signer_email: string;
  document_hash: string;
  creator_sig: string;
  creator_address: string;
  document_title: string;
  ipfs_cid: string;
  is_public: boolean;
  voucher_id: string;
}

// Interface for create invite response
export interface CreateInviteResponse {
  success: boolean;
  invite_id?: string;
  error?: string;
}

// Interface for submit signed contract request
export interface SubmitSignedRequest {
  invite_id: string;
  signer_sig: string;
  signer_wallet_addr: string;
  signer_email: string;
}

// Interface for submit signed contract response
export interface SubmitSignedResponse {
  success: boolean;
  contract_id?: string;
  tx_hash?: string;
  error?: string;
}

// Interface for sponsor transaction request
export interface SponsorTxRequest {
  tx: string; // base64 encoded transaction bytes
}

// Interface for sponsor transaction response
export interface SponsorTxResponse {
  success: boolean;
  sponsored_tx?: string;
  error?: string;
}

// Interface for getting invitation data
export interface GetInviteResponse {
  success: boolean;
  data?: InviteData;
  error?: string;
}

// Interface for expire invites response
export interface ExpireInvitesResponse {
  success: boolean;
  processed: number;
  expired: number;
  errors: number;
}

// Error types
export enum ErrorType {
  INVALID_REQUEST = 'INVALID_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  EXPIRED = 'EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVER_ERROR = 'SERVER_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR'
} 