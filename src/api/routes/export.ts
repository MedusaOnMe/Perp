import { Router, Request, Response } from 'express';
import { dbService } from '../../services/db.service';
import { walletService } from '../../services/wallet.service';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * POST /api/export/request
 * Request a wallet export - generates code and secret path
 */
router.post('/request', async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.body;

    if (!twitterHandle) {
      return res.status(400).json({ error: 'twitterHandle is required' });
    }

    // Get user
    const user = await dbService.getUserByHandle(twitterHandle);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please register first.' });
    }

    // Generate code and secret path
    const code = walletService.generateExportCode();
    const secretPath = walletService.generateSecretPath();

    // Set expiration (5 minutes from now)
    const now = Timestamp.now();
    const expiresAt = new Timestamp(now.seconds + 300, now.nanoseconds); // 5 min

    // Create pending export
    await dbService.createPendingExport({
      userId: user.id,
      twitterHandle: twitterHandle.toLowerCase().replace('@', ''),
      code,
      secretPath,
      expiresAt,
      status: 'pending',
      createdAt: now
    });

    res.json({
      code,
      secretPath,
      expiresIn: 300, // seconds
      message: `Tweet: @${process.env.TWITTER_BOT_HANDLE} export ${code}`
    });

  } catch (error) {
    console.error('Export request error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/export/status/:secretPath
 * Check if export is ready
 */
router.get('/status/:secretPath', async (req: Request, res: Response) => {
  try {
    const { secretPath } = req.params;

    // Check if key export exists
    const keyExport = await dbService.getKeyExport(secretPath);

    if (keyExport) {
      // Check if already accessed
      if (keyExport.accessed) {
        return res.json({ ready: false, expired: true, message: 'Already accessed' });
      }

      return res.json({ ready: true, expired: false });
    }

    // Check if pending export exists
    const pendingExport = await dbService.getPendingExportBySecretPath(secretPath);

    if (!pendingExport) {
      return res.json({ ready: false, expired: true, message: 'Not found' });
    }

    // Check if expired
    if (pendingExport.expiresAt.toMillis() < Date.now()) {
      return res.json({ ready: false, expired: true, message: 'Export request expired' });
    }

    // Still pending
    res.json({ ready: false, expired: false, message: 'Waiting for tweet confirmation' });

  } catch (error) {
    console.error('Export status error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/export/:secretPath
 * Get the exported private key (one-time read)
 */
router.get('/:secretPath', async (req: Request, res: Response) => {
  try {
    const { secretPath } = req.params;

    // Get key export
    const keyExport = await dbService.getKeyExport(secretPath);

    if (!keyExport) {
      return res.status(404).json({ error: 'Export not found or expired' });
    }

    // Check if already accessed
    if (keyExport.accessed) {
      await dbService.deleteKeyExport(secretPath);
      return res.status(410).json({ error: 'Export already accessed' });
    }

    // Return the key and immediately delete
    const privateKey = keyExport.privateKey;

    await dbService.deleteKeyExport(secretPath);

    res.json({
      privateKey,
      warning: 'This key will not be shown again. Store it securely.'
    });

  } catch (error) {
    console.error('Export retrieval error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
