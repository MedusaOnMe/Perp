import { Router, Request, Response } from 'express';
import { dbService } from '../../services/db.service';
import { blockchainService } from '../../services/blockchain.service';
import { orderlyService } from '../../services/orderly.service';
import { decrypt } from '../../services/encryption.service';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * GET /api/deposit/address
 * Get platform deposit address (where users send USDC)
 */
router.get('/address', async (req: Request, res: Response) => {
  try {
    const platformWallet = await dbService.getPlatformWallet();

    if (!platformWallet) {
      return res.status(500).json({
        error: 'Platform wallet not configured. Contact admin.'
      });
    }

    res.json({
      address: platformWallet.address,
      network: 'Arbitrum One',
      chainId: platformWallet.chainId,
      token: 'USDC',
      tokenAddress: process.env.USDC_CONTRACT_ADDRESS || '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      instructions: [
        '1. Send USDC to the address above on Arbitrum network',
        '2. Wait for 12 confirmations (~3 minutes)',
        '3. Your balance will be automatically credited',
        '4. Minimum deposit: $10 USDC'
      ]
    });

  } catch (error) {
    console.error('Error fetching deposit address:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/deposit/verify
 * Manually verify a deposit transaction
 * User provides tx hash after depositing
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { txHash, twitterHandle } = req.body;

    if (!txHash || !twitterHandle) {
      return res.status(400).json({
        error: 'txHash and twitterHandle are required'
      });
    }

    // Get user
    const user = await dbService.getUserByHandle(twitterHandle);
    if (!user) {
      return res.status(404).json({
        error: 'User not found. Please register first by tweeting @YourBot register'
      });
    }

    // Check if already processed
    const existing = await dbService.getDepositByTxHash(txHash);
    if (existing) {
      return res.status(400).json({
        error: 'Transaction already processed',
        deposit: {
          amount: existing.amount,
          status: existing.status,
          confirmedAt: existing.confirmedAt
        }
      });
    }

    // Get platform wallet
    const platformWallet = await dbService.getPlatformWallet();
    if (!platformWallet) {
      return res.status(500).json({ error: 'Platform wallet not configured' });
    }

    // Verify transaction on-chain
    console.log(`Verifying deposit tx: ${txHash} for @${twitterHandle}`);

    const verification = await blockchainService.verifyUSDCDeposit(
      txHash,
      platformWallet.address,
      10 // Minimum $10
    );

    if (!verification || !verification.valid) {
      return res.status(400).json({
        error: 'Invalid deposit transaction. Ensure you sent USDC to the correct address.'
      });
    }

    // Create deposit record
    const deposit = await dbService.createDeposit({
      userId: user.id,
      twitterHandle: user.twitterHandle,
      txHash,
      amount: verification.amount,
      fromAddress: verification.from,
      toAddress: platformWallet.address,
      blockNumber: verification.blockNumber,
      confirmations: verification.confirmations,
      requiredConfirmations: 12,
      status: verification.confirmations >= 12 ? 'confirmed' : 'pending',
      orderlyConfirmed: false,
      detectedAt: Timestamp.now(),
      retryCount: 0
    });

    // If confirmed, process immediately
    if (verification.confirmations >= 12) {
      try {
        // Credit internal balance
        await dbService.creditUserDeposit(user.id, verification.amount);

        // Credit Orderly account (using broker API or direct deposit)
        const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);
        await orderlyService.creditAccountBalance(
          user.accountId,
          verification.amount,
          orderlyPrivateKey
        );

        // Update deposit status
        await dbService.updateDepositStatus(deposit.id, 'credited', {
          orderlyConfirmed: true,
          creditedAt: Timestamp.now()
        });

        return res.json({
          success: true,
          message: `Deposited ${verification.amount} USDC successfully!`,
          deposit: {
            amount: verification.amount,
            confirmations: verification.confirmations,
            status: 'credited',
            txHash
          }
        });

      } catch (creditError) {
        console.error('Error crediting deposit:', creditError);

        // Update deposit with error
        await dbService.updateDepositStatus(deposit.id, 'failed', {
          errorMessage: creditError instanceof Error ? creditError.message : 'Unknown error',
          retryCount: 1
        });

        return res.status(500).json({
          error: 'Deposit detected but crediting failed. Our team will resolve this manually.',
          txHash,
          amount: verification.amount
        });
      }
    }

    // Still pending confirmations
    res.json({
      success: true,
      message: `Deposit detected! Waiting for confirmations...`,
      deposit: {
        amount: verification.amount,
        confirmations: verification.confirmations,
        required: 12,
        status: 'pending',
        txHash,
        estimatedTime: `${Math.ceil((12 - verification.confirmations) * 15 / 60)} minutes`
      }
    });

  } catch (error) {
    console.error('Deposit verification error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/deposit/:twitterHandle/history
 * Get deposit history for a user
 */
router.get('/:twitterHandle/history', async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const user = await dbService.getUserByHandle(twitterHandle);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deposits = await dbService.getUserDeposits(user.id, limit);

    res.json({
      twitterHandle: user.twitterHandle,
      totalDeposits: user.totalDeposits,
      deposits: deposits.map(d => ({
        txHash: d.txHash,
        amount: d.amount,
        status: d.status,
        confirmations: d.confirmations,
        detectedAt: d.detectedAt,
        creditedAt: d.creditedAt,
        blockNumber: d.blockNumber
      }))
    });

  } catch (error) {
    console.error('Deposit history error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/deposit/status/:txHash
 * Check status of a deposit transaction
 */
router.get('/status/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;

    const deposit = await dbService.getDepositByTxHash(txHash);

    if (!deposit) {
      return res.status(404).json({
        error: 'Deposit not found. Use /api/deposit/verify to submit a new deposit.'
      });
    }

    res.json({
      txHash: deposit.txHash,
      amount: deposit.amount,
      status: deposit.status,
      confirmations: deposit.confirmations,
      required: deposit.requiredConfirmations,
      orderlyConfirmed: deposit.orderlyConfirmed,
      detectedAt: deposit.detectedAt,
      confirmedAt: deposit.confirmedAt,
      creditedAt: deposit.creditedAt
    });

  } catch (error) {
    console.error('Deposit status error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
