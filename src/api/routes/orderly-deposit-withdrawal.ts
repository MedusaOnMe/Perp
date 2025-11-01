// Orderly Deposit & Withdrawal Routes
// Handles deposits and withdrawals via blockchain

import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import { OrderlyWallet } from '../../services/orderly-client/orderly-wallet';
import { orderlyConfig } from '../../../config/orderly.config';

const router = express.Router();

/**
 * POST /api/orderly/deposit/prepare
 * Prepare deposit transaction data
 * Returns unsigned transaction for frontend to sign and submit
 */
router.post('/deposit/prepare', async (req: Request, res: Response) => {
  try {
    const { accountId, brokerId, token, amount } = req.body;

    if (!accountId || !brokerId || !token || !amount) {
      return res.status(400).json({
        error: 'accountId, brokerId, token, and amount are required',
      });
    }

    const config = orderlyConfig.getConfig();

    // TODO(implement): Full on-chain deposit flow
    // 1. Calculate deposit fee via getDepositFee(userAddress, depositInput)
    // 2. Build DepositData struct (accountId, brokerHash, tokenHash, tokenAmount)
    // 3. Return unsigned transaction for vault.deposit(depositData, fee)

    res.status(501).json({
      error: 'Deposit preparation not yet implemented',
      todo: [
        'Calculate keccak256 hashes for broker and token',
        'Call Vault.getDepositFee() to get fee in WEI',
        'Build DepositData struct',
        'Return unsigned transaction data for frontend signing',
      ],
      vaultAddress: config.chainAddresses.vault,
      tokenAddress: token === 'USDC' ? config.chainAddresses.usdc : config.chainAddresses.usdt,
    });

  } catch (error: any) {
    console.error('Deposit preparation failed:', error);
    res.status(500).json({
      error: 'Deposit preparation failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/orderly/withdraw/prepare
 * Prepare withdrawal request with EIP-712 signature
 */
router.post('/withdraw/prepare', async (req: Request, res: Response) => {
  try {
    const { walletPrivateKey, brokerId, chainId, receiver, token, amount, withdrawNonce } = req.body;

    if (!walletPrivateKey || !brokerId || !chainId || !receiver || !token || !amount) {
      return res.status(400).json({
        error: 'walletPrivateKey, brokerId, chainId, receiver, token, and amount are required',
      });
    }

    const config = orderlyConfig.getConfig();
    const ledgerAddress = config.orderlyL2.ledger;

    const wallet = new OrderlyWallet(walletPrivateKey);

    // Sign withdrawal message
    const { message, signature } = await wallet.signWithdraw(
      brokerId,
      chainId,
      receiver,
      token,
      amount,
      withdrawNonce || 1,
      ledgerAddress
    );

    // TODO(implement): Submit to Orderly withdrawal API
    // POST /v1/withdraw_request with message + signature

    res.json({
      success: true,
      message,
      signature,
      todo: 'Submit to POST /v1/withdraw_request endpoint',
    });

  } catch (error: any) {
    console.error('Withdrawal preparation failed:', error);
    res.status(500).json({
      error: 'Withdrawal preparation failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/orderly/deposit/status/:txHash
 * Check deposit status by transaction hash
 */
router.get('/deposit/status/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;

    // TODO(implement): Query blockchain for transaction status
    // Check if transaction is confirmed and deposit is reflected in Orderly

    res.status(501).json({
      error: 'Deposit status check not yet implemented',
      txHash,
      todo: 'Query blockchain RPC and Orderly balance API',
    });

  } catch (error: any) {
    console.error('Deposit status check failed:', error);
    res.status(500).json({
      error: 'Deposit status check failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/orderly/withdraw/nonce/:accountId
 * Get next withdrawal nonce for account
 */
router.get('/withdraw/nonce/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    // TODO(implement): Call GET /v1/get_withdraw_nonce endpoint
    // Returns { withdraw_nonce: number }

    res.status(501).json({
      error: 'Withdrawal nonce retrieval not yet implemented',
      accountId,
      todo: 'Call GET /v1/get_withdraw_nonce API endpoint',
    });

  } catch (error: any) {
    console.error('Withdrawal nonce retrieval failed:', error);
    res.status(500).json({
      error: 'Withdrawal nonce retrieval failed',
      message: error.message,
    });
  }
});

export default router;
