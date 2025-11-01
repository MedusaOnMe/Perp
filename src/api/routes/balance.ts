import { Router, Request, Response } from 'express';
import { dbService } from '../../services/db.service';
import { orderlyService } from '../../services/orderly.service';
import { decrypt } from '../../services/encryption.service';

const router = Router();

/**
 * GET /api/balance/:twitterHandle
 * Get user's balance and positions
 */
router.get('/:twitterHandle', async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.params;

    // Get user
    const user = await dbService.getUserByHandle(twitterHandle);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Decrypt keys
    const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);

    // Fetch balance from Orderly
    const balance = await orderlyService.getBalance(user.accountId, orderlyPrivateKey);

    // Fetch positions from Orderly
    const orderlyPositions = await orderlyService.getPositions(user.accountId, orderlyPrivateKey);

    // Get local positions from DB
    const dbPositions = await dbService.getUserPositions(user.id);

    // Calculate total PnL
    const totalPnl = orderlyPositions.reduce((sum, pos) => sum + (pos.unsettled_pnl || 0), 0);

    res.json({
      twitterHandle: user.twitterHandle,
      accountId: user.accountId,
      balance: {
        available: balance.holding - balance.frozen,
        total: balance.holding,
        frozen: balance.frozen
      },
      positions: orderlyPositions.map(pos => ({
        symbol: pos.symbol,
        quantity: pos.position_qty,
        entryPrice: pos.average_open_price,
        markPrice: pos.mark_price,
        unrealizedPnl: pos.unsettled_pnl
      })),
      totalPnl,
      openPositions: orderlyPositions.length
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/balance/:twitterHandle/orders
 * Get user's order history
 */
router.get('/:twitterHandle/orders', async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Get user
    const user = await dbService.getUserByHandle(twitterHandle);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get orders from DB
    const orders = await dbService.getUserOrders(user.id, limit);

    res.json({
      twitterHandle: user.twitterHandle,
      orders: orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: order.avgFillPrice,
        leverage: order.leverage,
        status: order.status,
        createdAt: order.createdAt,
        tweetId: order.tweetId
      }))
    });

  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
