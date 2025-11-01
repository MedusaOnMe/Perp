import { Timestamp } from 'firebase-admin/firestore';

export type PositionSide = 'LONG' | 'SHORT';

export interface Position {
  id: string;                       // userId_symbol
  userId: string;
  symbol: string;                   // PERP_BTC_USDC
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  leverage: number;
  liquidationPrice: number;
  unrealizedPnl: number;

  // Timestamps
  openedAt: Timestamp;
  lastUpdatedAt: Timestamp;
  closedAt?: Timestamp;
}
