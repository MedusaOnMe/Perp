import { Timestamp } from 'firebase-admin/firestore';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'IOC' | 'FOK' | 'POST_ONLY';
export type OrderStatus = 'pending' | 'filled' | 'rejected' | 'cancelled' | 'partial';

export interface Order {
  id: string;
  userId: string;
  twitterHandle: string;
  tweetId: string;                  // Source tweet

  // Order details
  orderlyOrderId: string;           // From Orderly Network
  symbol: string;                   // PERP_BTC_USDC
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price?: number;                   // For limit orders
  leverage: number;

  // Status
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;

  // Timestamps
  createdAt: Timestamp;
  executedAt?: Timestamp;

  // PnL tracking
  realizedPnl?: number;
  fees: number;
}
