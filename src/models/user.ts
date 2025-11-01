import { Timestamp } from 'firebase-admin/firestore';

export interface User {
  id: string;
  twitterHandle: string;           // normalized lowercase
  twitterUserId: string;
  accountId: string;                // Orderly account ID
  walletAddress: string;            // EVM wallet address (0x...)

  // Encrypted fields (AES-256-GCM)
  encryptedWalletPrivateKey: string;
  encryptedOrderlyPrivateKey: string;    // Ed25519
  encryptedTradingPrivateKey: string;    // Secp256k1

  // Public keys
  orderlyPublicKey: string;
  orderlyTradingPublicKey: string;

  // Metadata
  createdAt: Timestamp;
  lastActivityAt: Timestamp;
  status: 'active' | 'suspended';

  // Internal ledger
  internalBalance: number;          // USDC
  totalDeposits: number;
  totalWithdrawals: number;
}

export interface PendingExport {
  id: string;
  userId: string;
  twitterHandle: string;
  code: string;                     // 6-digit code
  secretPath: string;               // UUID for retrieval
  createdAt: Timestamp;
  expiresAt: Timestamp;            // 5 min TTL
  status: 'pending' | 'completed' | 'expired';
}

export interface KeyExport {
  id: string;                       // = secretPath
  privateKey: string;               // Decrypted (plain text)
  createdAt: Timestamp;
  expiresAt: Timestamp;            // 30 sec TTL
  accessed: boolean;                // One-time read flag
}

export interface ProcessedTweet {
  id: string;                       // = tweetId
  tweetId: string;
  userId: string;
  twitterHandle: string;
  command: string;
  processedAt: Timestamp;
  result: 'success' | 'error';
  errorMessage?: string;
}
