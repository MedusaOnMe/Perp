// Command types
export type CommandType = 'register' | 'long' | 'short' | 'close' | 'balance' | 'export';

export interface ParsedCommand {
  type: CommandType;
  asset?: string;
  amount?: number;
  leverage?: number;
  code?: string;                    // For export command
  price?: number;                   // For limit orders
}

// Twitter types
export interface Tweet {
  id: string;
  text: string;
  author: {
    id: string;
    username: string;
    name: string;
  };
  created_at: string;
}

// Orderly types
export interface OrderlyOrderParams {
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
}

export interface OrderlyOrderResponse {
  success: boolean;
  data: {
    order_id: string;
    client_order_id?: string;
    order_type: string;
    order_price?: number;
    order_quantity: number;
    status: string;
  };
  timestamp: number;
}

export interface OrderlyBalance {
  holding: number;
  frozen: number;
  pending_short: number;
}

export interface OrderlyPosition {
  symbol: string;
  position_qty: number;
  cost_position: number;
  average_open_price: number;
  mark_price: number;
  unsettled_pnl: number;
}

// Risk limits
export const LIMITS = {
  maxPositionSize: 1000,            // $1000 USDC per position
  maxLeverage: 10,                  // 10x max
  maxOpenPositions: 5,              // 5 concurrent positions
  minOrderSize: 10,                 // $10 minimum
  maxDailyVolume: 5000              // $5000 per day per user
} as const;
