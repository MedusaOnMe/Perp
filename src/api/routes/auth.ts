import { Router, Request, Response } from 'express';
import { dbService } from '../../services/db.service';
import { walletService } from '../../services/wallet.service';
import { orderlyService } from '../../services/orderly.service';
import { decrypt } from '../../services/encryption.service';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * POST /api/auth/login
 * Unified login/register flow
 * - If user exists: return user data
 * - If user doesn't exist: auto-create account and return user data
 * Same flow, same button - seamless experience
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.body;

    if (!twitterHandle) {
      return res.status(400).json({ error: 'Twitter handle is required' });
    }

    // Normalize handle (remove @ if present, lowercase)
    const normalized = twitterHandle.toLowerCase().replace('@', '').trim();

    if (!normalized || normalized.length < 1) {
      return res.status(400).json({ error: 'Invalid Twitter handle' });
    }

    // Check if user already exists
    const existingUser = await dbService.getUserByHandle(normalized);

    if (existingUser) {
      // User exists - return their data
      console.log(`✅ User logged in: @${normalized}`);
      return res.json({
        success: true,
        isNew: false,
        message: 'Welcome back!',
        user: {
          twitterHandle: existingUser.twitterHandle,
          accountId: existingUser.accountId,
          walletAddress: existingUser.walletAddress,
          balance: existingUser.internalBalance,
          status: existingUser.status,
          createdAt: existingUser.createdAt
        }
      });
    }

    // User doesn't exist - create new account
    console.log(`Creating new account for: @${normalized}`);

    // Generate wallet keys
    const keys = await walletService.generateUserKeys();

    // Register account on Orderly Network
    const walletPrivateKey = decrypt(keys.encryptedWalletPrivateKey);
    const accountId = await orderlyService.registerAccount(keys.walletAddress, walletPrivateKey);

    // Create user in database
    const user = await dbService.createUser({
      twitterHandle: normalized,
      twitterUserId: '', // Not needed for web registration
      accountId,
      walletAddress: keys.walletAddress,
      encryptedWalletPrivateKey: keys.encryptedWalletPrivateKey,
      encryptedOrderlyPrivateKey: keys.encryptedOrderlyPrivateKey,
      encryptedTradingPrivateKey: keys.encryptedTradingPrivateKey,
      orderlyPublicKey: keys.orderlyPublicKey,
      orderlyTradingPublicKey: keys.orderlyTradingPublicKey,
      createdAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
      status: 'active',
      internalBalance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0
    });

    console.log(`✅ Account created: @${normalized} -> ${accountId}`);

    res.json({
      success: true,
      isNew: true,
      message: 'Account created successfully!',
      user: {
        twitterHandle: user.twitterHandle,
        accountId: user.accountId,
        walletAddress: user.walletAddress,
        balance: user.internalBalance,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Login/Registration error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process request'
    });
  }
});

export default router;
