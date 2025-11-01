import dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import { walletService } from './wallet.service';
import { OrderlyOrderParams, OrderlyOrderResponse, OrderlyBalance, OrderlyPosition } from '../models/types';

// Load environment variables
dotenv.config();

export class OrderlyService {
  private client: AxiosInstance;
  private brokerId: string;
  private chainId: number;

  constructor() {
    const apiUrl = process.env.ORDERLY_API_URL || 'https://api-evm.orderly.org';
    this.brokerId = process.env.ORDERLY_BROKER_ID || '';
    this.chainId = parseInt(process.env.ORDERLY_CHAIN_ID || '42161'); // Arbitrum mainnet

    if (!this.brokerId) {
      throw new Error('ORDERLY_BROKER_ID environment variable not set');
    }

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000
    });
  }

  /**
   * Register a new account on Orderly Network
   * @param walletAddress - EVM wallet address
   * @param walletPrivateKey - EVM private key (decrypted)
   * @returns Account ID
   */
  async registerAccount(walletAddress: string, walletPrivateKey: string): Promise<string> {
    try {
      // Step 1: Get registration nonce from Orderly
      const nonceResponse = await this.client.get('/v1/registration_nonce');

      if (!nonceResponse.data.success) {
        throw new Error(`Failed to get registration nonce: ${JSON.stringify(nonceResponse.data)}`);
      }

      const registrationNonce = nonceResponse.data.data.registration_nonce;
      const timestamp = Date.now();

      // Step 2: Create registration message
      const message = {
        brokerId: this.brokerId,
        chainId: this.chainId,
        timestamp,
        registrationNonce
      };

      // Step 3: Sign with EIP-712
      const signature = await walletService.signRegistrationMessage(walletPrivateKey, message);

      // Step 4: Call registration endpoint
      const response = await this.client.post('/v1/register_account', {
        message,
        signature,
        userAddress: walletAddress
      });

      if (!response.data.success) {
        throw new Error(`Registration failed: ${JSON.stringify(response.data)}`);
      }

      const accountId = response.data.data.account_id;
      console.log(`✅ Registered Orderly account: ${accountId}`);

      return accountId;

    } catch (error) {
      console.error('Error registering account:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Orderly registration error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Place a market order
   * @param params - Order parameters
   * @param orderlyPrivateKey - Ed25519 private key for auth (decrypted)
   * @param tradingPrivateKey - Secp256k1 private key for trading signature (decrypted)
   * @returns Order response
   */
  async placeOrder(
    params: OrderlyOrderParams,
    orderlyPrivateKey: string,
    tradingPrivateKey: string
  ): Promise<OrderlyOrderResponse> {
    try {
      const timestamp = Date.now();

      // Build order body
      const orderBody = {
        symbol: params.symbol,
        order_type: params.orderType,
        side: params.side,
        order_quantity: params.quantity,
        ...(params.price && { order_price: params.price })
      };

      // Generate trading signature
      const tradingSignature = await walletService.signTradingOrder(tradingPrivateKey, orderBody);

      // Add signature to body
      const bodyWithSignature = {
        ...orderBody,
        signature: tradingSignature
      };

      // Create auth signature for the request
      const authMessage = `${timestamp}POST/v1/order${JSON.stringify(bodyWithSignature)}`;
      const authSignature = await walletService.signOrderlyRequest(orderlyPrivateKey, authMessage);

      // Make request
      const response = await this.client.post('/v1/order', bodyWithSignature, {
        headers: {
          'Content-Type': 'application/json',
          'orderly-account-id': params.accountId,
          'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
          'orderly-signature': authSignature,
          'orderly-timestamp': timestamp.toString()
        }
      });

      return response.data;

    } catch (error) {
      console.error('Error placing order:', error);
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.message || error.message;
        throw new Error(`Orderly order error: ${errorMsg}`);
      }
      throw error;
    }
  }

  /**
   * Get current mark price for a symbol
   * @param symbol - Trading symbol (e.g., "PERP_BTC_USDC")
   * @returns Current mark price
   */
  async getMarkPrice(symbol: string): Promise<number> {
    try {
      const response = await this.client.get('/v1/public/market_trades', {
        params: { symbol, limit: 1 }
      });

      if (response.data.data && response.data.data.rows && response.data.data.rows.length > 0) {
        return parseFloat(response.data.data.rows[0].executed_price);
      }

      throw new Error(`No price data available for ${symbol}`);

    } catch (error) {
      console.error('Error fetching mark price:', error);
      throw error;
    }
  }

  /**
   * Get account balance
   * @param accountId - Account ID
   * @param orderlyPrivateKey - Ed25519 private key (decrypted)
   * @returns Balance information
   */
  async getBalance(accountId: string, orderlyPrivateKey: string): Promise<OrderlyBalance> {
    try {
      const timestamp = Date.now();
      const path = '/v1/client/holding';
      const authMessage = `${timestamp}GET${path}`;
      const signature = await walletService.signOrderlyRequest(orderlyPrivateKey, authMessage);

      const response = await this.client.get(path, {
        params: { all: false },
        headers: {
          'orderly-account-id': accountId,
          'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
          'orderly-signature': signature,
          'orderly-timestamp': timestamp.toString()
        }
      });

      const usdcHolding = response.data.data.holding.find((h: any) => h.token === 'USDC');

      return {
        holding: usdcHolding?.holding || 0,
        frozen: usdcHolding?.frozen || 0,
        pending_short: usdcHolding?.pending_short || 0
      };

    } catch (error) {
      console.error('Error fetching balance:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Orderly balance error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get open positions
   * @param accountId - Account ID
   * @param orderlyPrivateKey - Ed25519 private key (decrypted)
   * @returns Array of positions
   */
  async getPositions(accountId: string, orderlyPrivateKey: string): Promise<OrderlyPosition[]> {
    try {
      const timestamp = Date.now();
      const path = '/v1/positions';
      const authMessage = `${timestamp}GET${path}`;
      const signature = await walletService.signOrderlyRequest(orderlyPrivateKey, authMessage);

      const response = await this.client.get(path, {
        headers: {
          'orderly-account-id': accountId,
          'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
          'orderly-signature': signature,
          'orderly-timestamp': timestamp.toString()
        }
      });

      return response.data.data.rows || [];

    } catch (error) {
      console.error('Error fetching positions:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Orderly positions error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Close a position by placing opposite order
   * @param params - Order parameters for closing
   * @param orderlyPrivateKey - Ed25519 private key
   * @param tradingPrivateKey - Secp256k1 private key
   * @returns Order response
   */
  async closePosition(
    params: OrderlyOrderParams,
    orderlyPrivateKey: string,
    tradingPrivateKey: string
  ): Promise<OrderlyOrderResponse> {
    // Closing is just placing an opposite order
    return this.placeOrder(params, orderlyPrivateKey, tradingPrivateKey);
  }

  /**
   * Deposit USDC to an Orderly account
   * NOTE: This requires the USDC to already be in the user's wallet on-chain
   * Orderly uses a vault contract for deposits
   *
   * @param accountId - Orderly account ID
   * @param amount - Amount in USDC
   * @param walletPrivateKey - User's EVM wallet private key (decrypted)
   * @returns Transaction hash
   */
  async depositToAccount(
    accountId: string,
    amount: number,
    walletPrivateKey: string
  ): Promise<string> {
    try {
      console.log(`Depositing ${amount} USDC to Orderly account ${accountId}...`);

      // Note: Orderly's deposit flow typically involves:
      // 1. User approves USDC to Orderly's vault contract
      // 2. User calls deposit() on vault contract
      // 3. Orderly detects deposit and credits account

      // For custodial model, you may use Orderly's broker API to credit accounts directly
      // This endpoint may vary based on your broker agreement

      const timestamp = Date.now();
      const orderlyPrivateKey = walletPrivateKey; // You may need separate key

      const bodyData = {
        account_id: accountId,
        token: 'USDC',
        amount: amount,
        chain_id: this.chainId
      };

      const authMessage = `${timestamp}POST/v1/deposit${JSON.stringify(bodyData)}`;
      const signature = await walletService.signOrderlyRequest(orderlyPrivateKey, authMessage);

      // This is a placeholder - actual endpoint depends on Orderly broker setup
      const response = await this.client.post('/v1/deposit', bodyData, {
        headers: {
          'Content-Type': 'application/json',
          'orderly-account-id': accountId,
          'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
          'orderly-signature': signature,
          'orderly-timestamp': timestamp.toString()
        }
      });

      console.log(`✅ Deposit successful:`, response.data);
      return response.data.tx_hash || 'internal_transfer';

    } catch (error) {
      console.error('Error depositing to Orderly:', error);
      if (axios.isAxiosError(error)) {
        // If Orderly doesn't support direct deposits, you may need to use settlement layer
        console.warn('Direct deposit may not be supported. Consider using vault contract or broker settlement.');
        throw new Error(`Orderly deposit error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Alternative: Update account balance via broker API
   * Some Orderly broker setups allow direct balance crediting
   * This is typically used for custodial platforms
   *
   * @param accountId - Orderly account ID
   * @param amount - Amount to credit (positive) or debit (negative)
   * @param orderlyPrivateKey - Broker's Orderly private key
   */
  async creditAccountBalance(
    accountId: string,
    amount: number,
    orderlyPrivateKey: string
  ): Promise<void> {
    try {
      console.log(`Crediting ${amount} USDC to account ${accountId} via broker API...`);

      const timestamp = Date.now();

      const bodyData = {
        account_id: accountId,
        token: 'USDC',
        amount: amount
      };

      const authMessage = `${timestamp}POST/v1/broker/credit${JSON.stringify(bodyData)}`;
      const signature = await walletService.signOrderlyRequest(orderlyPrivateKey, authMessage);

      // Note: This endpoint may vary - check your broker agreement
      await this.client.post('/v1/broker/credit', bodyData, {
        headers: {
          'Content-Type': 'application/json',
          'orderly-broker-id': this.brokerId,
          'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
          'orderly-signature': signature,
          'orderly-timestamp': timestamp.toString()
        }
      });

      console.log(`✅ Account ${accountId} credited with ${amount} USDC`);

    } catch (error) {
      console.error('Error crediting account:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Orderly credit error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Helper: Get Ed25519 public key from private key
   */
  private async getPublicKeyFromPrivate(privateKeyHex: string): Promise<string> {
    const ed = await import('@noble/ed25519');
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
    const publicKeyBytes = await ed.getPublicKey(privateKeyBytes);
    return Buffer.from(publicKeyBytes).toString('hex');
  }
}

// Singleton instance
export const orderlyService = new OrderlyService();
