// Orderly Order Routes
// Handles order creation and management

import express, { Request, Response } from 'express';
import { OrderlyApiClient } from '../../services/orderly-client/orderly-api';
import { OrderlyAuth } from '../../services/orderly-client/orderly-auth';
import { OrderlyKeyService } from '../../services/orderly-client/orderly-key.service';
import { orderlyConfig, SYMBOL_FORMAT } from '../../../config/orderly.config';
import { CreateOrderRequest, OrderType, OrderSide } from '../../services/orderly-client/orderly-types';

const router = express.Router();
const orderlyKeyService = new OrderlyKeyService();

/**
 * POST /api/orderly/order
 * Create a new order
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      accountId,
      symbol, // e.g., "ETH" - will be converted to "PERP_ETH_USDC"
      orderType, // LIMIT, MARKET, IOC, FOK, POST_ONLY, ASK, BID
      side, // BUY, SELL
      price,
      quantity,
      amount,
      clientOrderId,
      reduceOnly,
      slippage,
    } = req.body;

    // Validation
    if (!accountId || !symbol || !orderType || !side) {
      return res.status(400).json({
        error: 'accountId, symbol, orderType, and side are required',
      });
    }

    // Get Orderly key for account
    const keyInfo = await orderlyKeyService.getKeyForAccount(accountId);

    if (!keyInfo) {
      return res.status(404).json({
        error: 'No valid Orderly key found for account. Generate one first.',
      });
    }

    // Check trading scope
    if (!keyInfo.scope.includes('trading')) {
      return res.status(403).json({
        error: 'Orderly key does not have trading scope',
      });
    }

    // Initialize auth and API client
    const config = orderlyConfig.getConfig();
    const auth = new OrderlyAuth(keyInfo.privateKeyHex, keyInfo.publicKeyBase58, accountId);
    const apiClient = new OrderlyApiClient({ baseUrl: config.apiBaseUrl, auth });

    // Format symbol
    const orderlySymbol = SYMBOL_FORMAT.create(symbol);

    // Build order request
    const orderRequest: CreateOrderRequest = {
      symbol: orderlySymbol,
      order_type: orderType as OrderType,
      side: side as OrderSide,
    };

    // Add price (required for LIMIT, optional for others)
    if (price !== undefined) {
      orderRequest.order_price = parseFloat(price);
    }

    // Add quantity or amount (mutually exclusive)
    if (quantity !== undefined) {
      orderRequest.order_quantity = parseFloat(quantity);
    } else if (amount !== undefined) {
      orderRequest.order_amount = parseFloat(amount);
    } else if (orderType !== 'ASK' && orderType !== 'BID') {
      return res.status(400).json({
        error: 'Either quantity or amount is required',
      });
    }

    // Optional parameters
    if (clientOrderId) orderRequest.client_order_id = clientOrderId;
    if (reduceOnly !== undefined) orderRequest.reduce_only = reduceOnly;
    if (slippage !== undefined) orderRequest.slippage = parseFloat(slippage);

    // Validate order parameters
    const validationError = validateOrder(orderRequest);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Create order
    const orderResponse = await apiClient.createOrder(orderRequest);

    res.json({
      success: true,
      order: orderResponse,
    });

  } catch (error: any) {
    console.error('Order creation failed:', error);
    res.status(500).json({
      error: 'Order creation failed',
      message: error.message,
    });
  }
});

/**
 * Validate order parameters
 */
function validateOrder(order: CreateOrderRequest): string | null {
  // LIMIT orders require price
  if (order.order_type === 'LIMIT' && !order.order_price) {
    return 'LIMIT orders require order_price';
  }

  // MARKET, ASK, BID don't need price
  if (['MARKET', 'ASK', 'BID'].includes(order.order_type) && order.order_price) {
    return `${order.order_type} orders should not specify order_price`;
  }

  // ASK/BID don't need quantity/amount
  if (['ASK', 'BID'].includes(order.order_type)) {
    if (order.order_quantity || order.order_amount) {
      return `${order.order_type} orders should not specify quantity/amount`;
    }
  }

  // Check quantity and amount are mutually exclusive
  if (order.order_quantity && order.order_amount) {
    return 'Cannot specify both order_quantity and order_amount';
  }

  // Validate side
  if (!['BUY', 'SELL'].includes(order.side)) {
    return 'side must be BUY or SELL';
  }

  // Validate price is positive
  if (order.order_price !== undefined && order.order_price <= 0) {
    return 'order_price must be positive';
  }

  // Validate quantity is positive
  if (order.order_quantity !== undefined && order.order_quantity <= 0) {
    return 'order_quantity must be positive';
  }

  // Validate amount is positive
  if (order.order_amount !== undefined && order.order_amount <= 0) {
    return 'order_amount must be positive';
  }

  return null;
}

export default router;
