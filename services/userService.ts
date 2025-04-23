/**
 * User Service
 * 
 * API service for handling user profile operations, authentication,
 * and user-related data management.
 */

import axios from 'axios';

// Types for user operations
export interface UserProfile {
  id: string;
  walletAddress: string;
  username?: string;
  email?: string;
  fullName?: string;
  avatar?: string;
  role: 'user' | 'admin' | 'verifier';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileParams {
  username?: string;
  email?: string;
  fullName?: string;
  avatar?: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
  refreshToken: string;
}

/**
 * Service for user operations
 */
export const userService = {
  /**
   * Authenticate user with wallet
   * 
   * @param walletAddress - The wallet address to authenticate with
   * @param signature - The signature proving ownership of the wallet
   * @returns Promise resolving to authentication response
   */
  async authenticate(walletAddress: string, signature: string): Promise<AuthResponse> {
    try {
      const response = await axios.post<AuthResponse>('/api/users/auth', {
        walletAddress,
        signature
      });
      return response.data;
    } catch (error) {
      console.error('Error authenticating user:', error);
      throw error;
    }
  },

  /**
   * Get the current user's profile
   * 
   * @returns Promise resolving to user profile or null if not authenticated
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const response = await axios.get<UserProfile>('/api/users/me');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return null;
      }
      console.error('Error getting current user:', error);
      throw error;
    }
  },

  /**
   * Update the current user's profile
   * 
   * @param params - Parameters to update in the profile
   * @returns Promise resolving to the updated user profile
   */
  async updateProfile(params: UpdateProfileParams): Promise<UserProfile> {
    try {
      const response = await axios.put<UserProfile>('/api/users/profile', params);
      return response.data;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  },

  /**
   * Fetch a user profile by wallet address
   * 
   * @param walletAddress - The wallet address to look up
   * @returns Promise resolving to user profile
   */
  async getUserByWallet(walletAddress: string): Promise<UserProfile> {
    try {
      const response = await axios.get<UserProfile>(`/api/users/wallet/${walletAddress}`);
      return response.data;
    } catch (error) {
      console.error('Error getting user by wallet:', error);
      throw error;
    }
  },

  /**
   * Log out the current user
   * 
   * @returns Promise resolving to a success status
   */
  async logout(): Promise<{ success: boolean }> {
    try {
      const response = await axios.post<{ success: boolean }>('/api/users/logout');
      return response.data;
    } catch (error) {
      console.error('Error logging out user:', error);
      throw error;
    }
  },

  /**
   * Refresh the auth token using a refresh token
   * 
   * @returns Promise resolving to new auth tokens
   */
  async refreshToken(): Promise<{ token: string; refreshToken: string }> {
    try {
      const response = await axios.post<{ token: string; refreshToken: string }>('/api/users/refresh-token');
      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  },

  /**
   * Check if an email is already registered
   * 
   * @param email - The email to check
   * @returns Promise resolving to whether the email is available
   */
  async checkEmailAvailability(email: string): Promise<boolean> {
    try {
      const response = await axios.get<{ available: boolean }>(`/api/users/email-check?email=${encodeURIComponent(email)}`);
      return response.data.available;
    } catch (error) {
      console.error('Error checking email availability:', error);
      throw error;
    }
  }
};

export default userService; 