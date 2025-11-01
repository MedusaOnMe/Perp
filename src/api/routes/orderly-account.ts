// Orderly Account Routes
// Handles account registration, lookup, and key management

import express, { Request, Response } from 'express';
import { OrderlyApiClient } from '../../services/orderly-client/orderly-api';
import { OrderlyWallet, registerUserAccount, addOrderlyKeyToAccount } from '../../services/orderly-client/orderly-wallet';
import { OrderlyKeyService } from '../../services/orderly-client/orderly-key.service';
import { orderlyConfig } from '../../../config/orderly.config';

const router = express.Router();
const orderlyKeyService = new OrderlyKeyService();

/**
 * POST /api/orderly/account/register
 * Register new Orderly account for a wallet
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { walletPrivateKey } = req.body;

    if (!walletPrivateKey) {
      return res.status(400).json({ error: 'walletPrivateKey is required' });
    }

    const config = orderlyConfig.getConfig();
    const apiClient = new OrderlyApiClient({ baseUrl: config.apiBaseUrl });
    const wallet = new OrderlyWallet(walletPrivateKey);

    // Register account
    const accountId = await registerUserAccount(
      wallet,
      apiClient,
      config.brokerId,
      config.chainId
    );

    // Generate Orderly key
    const { publicKeyBase58, privateKeyHex } = await orderlyKeyService.generateKeyForAccount(
      accountId,
      'trading',
      365
    );

    // Add Orderly key to account via API
    await addOrderlyKeyToAccount(
      wallet,
      apiClient,
      config.brokerId,
      config.chainId,
      publicKeyBase58,
      'trading'
    );

    res.json({
      success: true,
      accountId,
      walletAddress: wallet.getAddress(),
      orderlyKey: publicKeyBase58,
    });

  } catch (error: any) {
    console.error('Account registration failed:', error);
    res.status(500).json({
      error: 'Account registration failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/orderly/account/:address
 * Get all accounts for a wallet address
 */
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const config = orderlyConfig.getConfig();

    const apiClient = new OrderlyApiClient({ baseUrl: config.apiBaseUrl });

    const accounts = await apiClient.getAllAccounts({
      address,
      broker_id: config.brokerId,
    });

    res.json({
      success: true,
      accounts: accounts.rows,
    });

  } catch (error: any) {
    console.error('Failed to fetch accounts:', error);
    res.status(500).json({
      error: 'Failed to fetch accounts',
      message: error.message,
    });
  }
});

/**
 * POST /api/orderly/account/key/generate
 * Generate new Orderly key for existing account
 */
router.post('/key/generate', async (req: Request, res: Response) => {
  try {
    const { accountId, walletPrivateKey, scope = 'trading', expirationDays = 365 } = req.body;

    if (!accountId || !walletPrivateKey) {
      return res.status(400).json({ error: 'accountId and walletPrivateKey are required' });
    }

    const config = orderlyConfig.getConfig();
    const apiClient = new OrderlyApiClient({ baseUrl: config.apiBaseUrl });
    const wallet = new OrderlyWallet(walletPrivateKey);

    // Generate new key
    const { publicKeyBase58 } = await orderlyKeyService.generateKeyForAccount(
      accountId,
      scope,
      expirationDays
    );

    // Add to Orderly
    await addOrderlyKeyToAccount(
      wallet,
      apiClient,
      config.brokerId,
      config.chainId,
      publicKeyBase58,
      scope
    );

    res.json({
      success: true,
      publicKey: publicKeyBase58,
      scope,
      expirationDays,
    });

  } catch (error: any) {
    console.error('Key generation failed:', error);
    res.status(500).json({
      error: 'Key generation failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/orderly/account/key/:accountId
 * Get Orderly key info for an account
 */
router.get('/key/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    const keyInfo = await orderlyKeyService.getKeyExpiration(accountId);

    if (!keyInfo) {
      return res.status(404).json({ error: 'No Orderly key found for account' });
    }

    res.json({
      success: true,
      ...keyInfo,
    });

  } catch (error: any) {
    console.error('Failed to fetch key info:', error);
    res.status(500).json({
      error: 'Failed to fetch key info',
      message: error.message,
    });
  }
});

export default router;
