// Orderly Network EVM API Client
// Based on: https://orderly.network/docs/build-on-omnichain/evm-api

import axios, { AxiosInstance, AxiosError } from 'axios';
import { OrderlyAuth } from './orderly-auth';
import { createOrderlyError, isRetryableError, isClockSkewError } from './orderly-errors';
import {
  OrderlyResponse,
  GetBuilderListRequest,
  GetBuilderListResponse,
  GetAllAccountsRequest,
  GetAllAccountsResponse,
  GetRegistrationNonceResponse,
  RegisterAccountRequest,
  RegisterAccountResponse,
  GetOrderlyKeyRequest,
  GetOrderlyKeyResponse,
  AddOrderlyKeyRequest,
  CreateOrderRequest,
  CreateOrderResponse,
} from './orderly-types';

interface OrderlyApiConfig {
  baseUrl: string;
  auth?: OrderlyAuth;
  timeout?: number;
  maxRetries?: number;
  debug?: boolean;
}

export class OrderlyApiClient {
  private axios: AxiosInstance;
  private auth?: OrderlyAuth;
  private maxRetries: number;
  private debug: boolean;

  constructor(config: OrderlyApiConfig) {
    this.auth = config.auth;
    this.maxRetries = config.maxRetries || 3;
    this.debug = config.debug || false;

    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.axios.interceptors.request.use((request) => {
      if (this.debug) {
        console.log('[Orderly Request]', {
          method: request.method?.toUpperCase(),
          url: request.url,
          headers: this.redactHeaders(request.headers),
        });
      }
      return request;
    });

    // Response interceptor for logging
    this.axios.interceptors.response.use(
      (response) => {
        if (this.debug) {
          console.log('[Orderly Response]', {
            status: response.status,
            data: response.data,
          });
        }
        return response;
      },
      (error) => {
        if (this.debug) {
          console.error('[Orderly Error]', {
            status: error.response?.status,
            data: error.response?.data,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  // ============================================================================
  // PUBLIC ENDPOINTS
  // ============================================================================

  /**
   * GET /v1/public/broker/name
   * Get list of available builders
   */
  async getBuilderList(
    params?: GetBuilderListRequest
  ): Promise<GetBuilderListResponse> {
    const response = await this.get<GetBuilderListResponse>(
      '/v1/public/broker/name',
      params
    );
    return response;
  }

  /**
   * GET /v1/get_all_accounts
   * Get all accounts for a wallet address
   */
  async getAllAccounts(
    params: GetAllAccountsRequest
  ): Promise<GetAllAccountsResponse> {
    const response = await this.get<GetAllAccountsResponse>(
      '/v1/get_all_accounts',
      params
    );
    return response;
  }

  /**
   * GET /v1/registration_nonce
   * Get nonce for account registration (valid 2 minutes)
   */
  async getRegistrationNonce(): Promise<GetRegistrationNonceResponse> {
    const response = await this.get<GetRegistrationNonceResponse>(
      '/v1/registration_nonce'
    );
    return response;
  }

  /**
   * POST /v1/register_account
   * Register new account with EIP-712 signature
   */
  async registerAccount(
    request: RegisterAccountRequest
  ): Promise<RegisterAccountResponse> {
    const response = await this.post<RegisterAccountResponse>(
      '/v1/register_account',
      request
    );
    return response;
  }

  /**
   * GET /v1/get_orderly_key
   * Get information about an Orderly key
   */
  async getOrderlyKey(
    params: GetOrderlyKeyRequest
  ): Promise<GetOrderlyKeyResponse> {
    const response = await this.get<GetOrderlyKeyResponse>(
      '/v1/get_orderly_key',
      params
    );
    return response;
  }

  /**
   * POST /v1/orderly_key
   * Add new Orderly key to account
   */
  async addOrderlyKey(request: AddOrderlyKeyRequest): Promise<void> {
    await this.post<void>('/v1/orderly_key', request);
  }

  // ============================================================================
  // PRIVATE ENDPOINTS (require authentication)
  // ============================================================================

  /**
   * POST /v1/order
   * Create a new order (requires 'trading' scope)
   */
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    if (!this.auth) {
      throw new Error('Authentication required for createOrder');
    }

    const response = await this.postAuthenticated<CreateOrderResponse>(
      '/v1/order',
      request
    );
    return response;
  }

  // ============================================================================
  // INTERNAL HTTP METHODS
  // ============================================================================

  /**
   * GET request (public)
   */
  private async get<T>(path: string, params?: any): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  /**
   * POST request (public)
   */
  private async post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * POST request (authenticated)
   */
  private async postAuthenticated<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, body, undefined, true);
  }

  /**
   * Generic request with retry logic
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    params?: any,
    requireAuth: boolean = false
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: any = {};

        // Add authentication headers if required
        if (requireAuth && this.auth) {
          const authHeaders = await this.auth.generateAuthHeaders(method, path, body);
          Object.assign(headers, authHeaders);
        }

        const response = await this.axios.request<OrderlyResponse<T>>({
          method,
          url: path,
          data: body,
          params,
          headers,
        });

        // Check if response indicates error
        if (response.data && 'success' in response.data) {
          if (response.data.success === false) {
            const errorResp = response.data as any;
            throw createOrderlyError(errorResp.code, errorResp.message);
          }
        }

        // Extract data from success response
        return (response.data as any).data as T;

      } catch (error) {
        lastError = error;

        // Handle axios errors
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          // Parse Orderly error response
          if (axiosError.response?.data) {
            const errorData = axiosError.response.data as any;
            if (errorData.code && errorData.message) {
              const orderlyError = createOrderlyError(errorData.code, errorData.message);

              // Check if retryable
              if (!isRetryableError(errorData.code)) {
                throw orderlyError;
              }

              // Clock skew errors should be thrown immediately with guidance
              if (isClockSkewError(errorData.code, errorData.message)) {
                throw new Error(
                  `${orderlyError.message}. Check your system clock and sync with NTP.`
                );
              }

              lastError = orderlyError;
            }
          }
        }

        // Retry with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          if (this.debug) {
            console.log(`[Orderly] Retrying after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          }
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Redact sensitive headers for logging
   */
  private redactHeaders(headers: any): any {
    const redacted = { ...headers };
    const sensitiveKeys = ['orderly-signature', 'orderly-key', 'Authorization'];

    sensitiveKeys.forEach((key) => {
      if (redacted[key]) {
        redacted[key] = '[REDACTED]';
      }
    });

    return redacted;
  }

  /**
   * Set or update authentication
   */
  setAuth(auth: OrderlyAuth): void {
    this.auth = auth;
  }

  /**
   * Get current authentication
   */
  getAuth(): OrderlyAuth | undefined {
    return this.auth;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
