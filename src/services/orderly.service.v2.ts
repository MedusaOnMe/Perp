// Orderly Service V2 - Using new typed Orderly client
// Replaces legacy orderly.service.ts

import { OrderlyApiClient } from './orderly-client/orderly-api';
import { OrderlyAuth } from './orderly-client/orderly-auth';
import { OrderlyKeyService } from './orderly-client/orderly-key.service';
import { OrderlyWallet, registerUserAccount, addOrderlyKeyToAccount } from './orderly-client/orderly-wallet';
import { orderlyConfig, SYMBOL_FORMAT } from '../../config/orderly.config';
import { OrderlyOrderParams, OrderlyOrderResponse, OrderlyBalance, OrderlyPosition } from '../models/types';

export class OrderlyServiceV2 {
  private apiClient: OrderlyApiClient;
  private orderlyKeyService: OrderlyKeyService;
  private config: ReturnType<typeof orderlyConfig.getConfig>;

  constructor() {
    this.config = orderlyConfig.getConfig();
    this.apiClient = new OrderlyApiClient({
      baseUrl: this.config.apiBaseUrl,
      debug: process.env.NODE_ENV === 'development',
    });
    this.orderlyKeyService = new OrderlyKeyService();
  }

  /**
   * Register a new account on Orderly Network
   * @param walletAddress - EVM wallet address
   * @param walletPrivateKey - EVM private key (decrypted)
   * @returns Account ID
   */
  async registerAccount(walletAddress: string, walletPrivateKey: string): Promise<string> {
    const wallet = new OrderlyWallet(walletPrivateKey);

    // Register account
    const accountId = await registerUserAccount(
      wallet,
      this.apiClient,
      this.config.brokerId,
      this.config.chainId
    );

    // Generate and add Orderly key
    const { publicKeyBase58 } = await this.orderlyKeyService.generateKeyForAccount(
      accountId,
      'trading',
      365
    );

    await addOrderlyKeyToAccount(
      wallet,
      this.apiClient,
      this.config.brokerId,
      this.config.chainId,
      publicKeyBase58,
      'trading'
    );

    console.log(`✅ Registered Orderly account: ${accountId}`);
    return accountId;
  }

  /**
   * Place a market order
   * @param params - Order parameters
   * @param orderlyPrivateKey - Ed25519 private key (deprecated - retrieved from storage)
   * @param tradingPrivateKey - Secp256k1 private key (deprecated - no longer used)
   * @returns Order response
   */
  async placeOrder(
    params: OrderlyOrderParams,
    orderlyPrivateKey?: string,
    tradingPrivateKey?: string
  ): Promise<OrderlyOrderResponse> {
    // Get Orderly key from storage
    const keyInfo = await this.orderlyKeyService.getKeyForAccount(params.accountId);

    if (!keyInfo) {
      throw new Error('No Orderly key found for account. Register first.');
    }

    // Initialize auth
    const auth = new OrderlyAuth(keyInfo.privateKeyHex, keyInfo.publicKeyBase58, params.accountId);
    this.apiClient.setAuth(auth);

    // Format symbol if needed
    const symbol = params.symbol.startsWith('PERP_')
      ? params.symbol
      : SYMBOL_FORMAT.create(params.symbol);

    // Place order
    const orderResponse = await this.apiClient.createOrder({
      symbol,
      order_type: params.orderType,
      side: params.side,
      order_price: params.price,
      order_quantity: params.quantity,
    });

    return {
      success: true,
      data: {
        order_id: orderResponse.order_id.toString(),
        client_order_id: orderResponse.client_order_id,
        order_type: orderResponse.order_type,
        order_price: orderResponse.order_price,
        order_quantity: orderResponse.order_quantity || 0,
        status: 'NEW', // TODO: API doesn't return status, default to NEW
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Get current mark price for a symbol
   * @param symbol - Trading symbol (e.g., "PERP_BTC_USDC" or "BTC")
   * @returns Current mark price
   */
  async getMarkPrice(symbol: string): Promise<number> {
    // Format symbol if needed
    const orderlySymbol = symbol.startsWith('PERP_')
      ? symbol
      : SYMBOL_FORMAT.create(symbol);

    // TODO(implement): Add market_trades endpoint to OrderlyApiClient
    throw new Error('getMarkPrice not yet migrated to V2 client');
  }

  /**
   * Get account balance
   * @param accountId - Account ID
   * @param orderlyPrivateKey - Ed25519 private key (deprecated - retrieved from storage)
   * @returns Balance information
   */
  async getBalance(accountId: string, orderlyPrivateKey?: string): Promise<OrderlyBalance> {
    // Get Orderly key from storage
    const keyInfo = await this.orderlyKeyService.getKeyForAccount(accountId);

    if (!keyInfo) {
      throw new Error('No Orderly key found for account');
    }

    // Initialize auth
    const auth = new OrderlyAuth(keyInfo.privateKeyHex, keyInfo.publicKeyBase58, accountId);
    this.apiClient.setAuth(auth);

    // TODO(implement): Add client/holding endpoint to OrderlyApiClient
    throw new Error('getBalance not yet migrated to V2 client');
  }

  /**
   * Get open positions
   * @param accountId - Account ID
   * @param orderlyPrivateKey - Ed25519 private key (deprecated - retrieved from storage)
   * @returns Array of positions
   */
  async getPositions(accountId: string, orderlyPrivateKey?: string): Promise<OrderlyPosition[]> {
    // Get Orderly key from storage
    const keyInfo = await this.orderlyKeyService.getKeyForAccount(accountId);

    if (!keyInfo) {
      throw new Error('No Orderly key found for account');
    }

    // Initialize auth
    const auth = new OrderlyAuth(keyInfo.privateKeyHex, keyInfo.publicKeyBase58, accountId);
    this.apiClient.setAuth(auth);

    // TODO(implement): Add positions endpoint to OrderlyApiClient
    throw new Error('getPositions not yet migrated to V2 client');
  }

  /**
   * Close a position by placing opposite order
   * @param params - Order parameters for closing
   * @param orderlyPrivateKey - Ed25519 private key (deprecated)
   * @param tradingPrivateKey - Secp256k1 private key (deprecated)
   * @returns Order response
   */
  async closePosition(
    params: OrderlyOrderParams,
    orderlyPrivateKey?: string,
    tradingPrivateKey?: string
  ): Promise<OrderlyOrderResponse> {
    return this.placeOrder(params, orderlyPrivateKey, tradingPrivateKey);
  }
}

// Singleton instance
export const orderlyServiceV2 = new OrderlyServiceV2();
