import { Timestamp } from 'firebase-admin/firestore';

export type DepositStatus = 'pending' | 'confirmed' | 'credited' | 'failed';

export interface Deposit {
  id: string;
  userId: string;
  twitterHandle: string;

  // Transaction details
  txHash: string;
  amount: number;                   // USDC amount
  fromAddress: string;              // User's sending address
  toAddress: string;                // Platform wallet address

  // Blockchain
  blockNumber?: number;
  confirmations: number;
  requiredConfirmations: number;    // Default: 12 for Arbitrum

  // Status
  status: DepositStatus;

  // Orderly transfer
  orderlyTransferTx?: string;       // Transaction ID when sent to Orderly
  orderlyConfirmed: boolean;

  // Timestamps
  detectedAt: Timestamp;
  confirmedAt?: Timestamp;
  creditedAt?: Timestamp;

  // Error tracking
  errorMessage?: string;
  retryCount: number;
}

export interface PlatformWallet {
  id: string;
  address: string;                  // Platform's deposit address
  privateKey: string;               // Encrypted
  chainId: number;
  network: string;                  // 'arbitrum', 'ethereum', etc.
  lastScannedBlock: number;
  createdAt: Timestamp;
}
