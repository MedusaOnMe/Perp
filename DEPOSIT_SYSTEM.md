# Deposit System Documentation

## Overview

The XPerps platform uses a custodial deposit system where users send USDC to a platform-controlled wallet, which then credits their individual Orderly trading accounts.

## Architecture

```
User Wallet (Arbitrum)
       ↓
   [Send USDC]
       ↓
Platform Wallet (0x...)
       ↓
  [Detect & Verify]
       ↓
Credit Internal Balance
       ↓
Transfer to User's Orderly Account
       ↓
User Can Trade
```

## Setup

### 1. Generate Platform Wallet

```bash
npm run setup-wallet
```

This creates a new wallet or registers an existing one from `.env`:
- Generates/imports wallet
- Encrypts private key
- Stores in Firestore `platform_wallets` collection
- Returns deposit address

**Save the private key securely!**

### 2. Fund Platform Wallet with ETH

The platform wallet needs ETH for gas fees when transferring USDC to Orderly accounts.

```bash
# Send ~0.1 ETH to platform wallet address on Arbitrum
# Check balance:
cast balance <PLATFORM_WALLET_ADDRESS> --rpc-url https://arb1.arbitrum.io/rpc
```

### 3. Configure Environment

Add to `.env`:

```env
# Blockchain
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
USDC_CONTRACT_ADDRESS=0xaf88d065e77c8cC2239327C5EDb3A432268e5831
PLATFORM_WALLET_PRIVATE_KEY=0x...your-private-key
```

### 4. Start Deposit Monitor

```bash
npm run worker:deposit-monitor
```

Or use `npm run start:all` to run all workers.

## User Deposit Flow

### Frontend Integration

#### 1. Show Deposit Address

```javascript
// GET /api/deposit/address
const response = await fetch('https://api.yourplatform.com/api/deposit/address');
const data = await response.json();

console.log(data.address); // Platform wallet address
console.log(data.network); // "Arbitrum One"
console.log(data.tokenAddress); // USDC contract address
```

Response:
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "Arbitrum One",
  "chainId": 42161,
  "token": "USDC",
  "tokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "instructions": [
    "1. Send USDC to the address above on Arbitrum network",
    "2. Wait for 12 confirmations (~3 minutes)",
    "3. Your balance will be automatically credited",
    "4. Minimum deposit: $10 USDC"
  ]
}
```

#### 2. User Sends USDC

User initiates USDC transfer from their wallet (MetaMask, etc.) to platform address.

#### 3. Verify Transaction

After user sends USDC, they submit the transaction hash:

```javascript
// POST /api/deposit/verify
const response = await fetch('https://api.yourplatform.com/api/deposit/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    twitterHandle: 'alice',
    txHash: '0x123abc...'
  })
});

const result = await response.json();
```

Response (if confirmed):
```json
{
  "success": true,
  "message": "Deposited 100 USDC successfully!",
  "deposit": {
    "amount": 100,
    "confirmations": 15,
    "status": "credited",
    "txHash": "0x123abc..."
  }
}
```

Response (if pending):
```json
{
  "success": true,
  "message": "Deposit detected! Waiting for confirmations...",
  "deposit": {
    "amount": 100,
    "confirmations": 5,
    "required": 12,
    "status": "pending",
    "txHash": "0x123abc...",
    "estimatedTime": "2 minutes"
  }
}
```

#### 4. Check Status

Poll for deposit status while pending:

```javascript
// GET /api/deposit/status/:txHash
const response = await fetch('https://api.yourplatform.com/api/deposit/status/0x123abc...');
const status = await response.json();

console.log(status.confirmations); // Current confirmations
console.log(status.status); // "pending" | "confirmed" | "credited"
```

#### 5. View History

```javascript
// GET /api/deposit/:twitterHandle/history
const response = await fetch('https://api.yourplatform.com/api/deposit/alice/history');
const data = await response.json();

console.log(data.totalDeposits); // $500
console.log(data.deposits); // Array of deposit objects
```

## Backend Processing

### Deposit Monitor Worker

Runs every 30 seconds:

1. **Scans Blockchain**
   - Queries Arbitrum for USDC Transfer events to platform wallet
   - Scans from `lastScannedBlock` to current block
   - Filters minimum $10 deposits

2. **Creates Deposit Records**
   - Saves to `deposits` collection
   - Status: `pending` (< 12 confirmations) or `confirmed` (>= 12)
   - Initially no `userId` (claimed via /verify endpoint)

3. **Processes Confirmed Deposits**
   - Waits for 12 confirmations (~3 minutes on Arbitrum)
   - Credits user's `internalBalance`
   - Calls Orderly broker API to credit trading account
   - Updates status to `credited`

4. **Error Handling**
   - Retries failed credits up to 3 times
   - Alerts admin if retry count exceeds threshold
   - Logs errors to console

### Database Schema

#### `deposits` Collection

```typescript
{
  id: string;
  userId: string;              // Linked after verification
  twitterHandle: string;
  txHash: string;              // Unique blockchain tx
  amount: number;              // USDC amount
  fromAddress: string;         // User's sending address
  toAddress: string;           // Platform wallet
  blockNumber: number;
  confirmations: number;
  requiredConfirmations: 12;
  status: 'pending' | 'confirmed' | 'credited' | 'failed';
  orderlyConfirmed: boolean;   // Credited to Orderly account
  detectedAt: Timestamp;
  confirmedAt?: Timestamp;
  creditedAt?: Timestamp;
  errorMessage?: string;
  retryCount: number;
}
```

#### `platform_wallets` Collection

```typescript
{
  id: string;
  address: string;             // Deposit address
  privateKey: string;          // Encrypted
  chainId: 42161;
  network: 'arbitrum';
  lastScannedBlock: number;    // Cursor for blockchain scanning
  createdAt: Timestamp;
}
```

## Orderly Integration

### Crediting User Accounts

Two methods supported (depends on your broker agreement):

#### Method 1: Broker API Direct Credit

```typescript
await orderlyService.creditAccountBalance(
  user.accountId,
  amount,
  brokerPrivateKey
);
```

Calls `POST /v1/broker/credit` with broker authentication.

#### Method 2: On-Chain Deposit

```typescript
await orderlyService.depositToAccount(
  user.accountId,
  amount,
  userWalletPrivateKey
);
```

Calls Orderly vault contract on-chain (requires USDC approval).

**Note**: Method 1 is recommended for custodial platforms. Contact Orderly Network to enable broker crediting.

## Security Considerations

### 1. Platform Wallet Security

- Private key encrypted with AES-256-GCM
- Stored in Firestore (access controlled)
- Only decrypt in memory when needed
- **Production**: Use AWS Secrets Manager or HashiCorp Vault

### 2. Deposit Verification

- Validates transaction on-chain before crediting
- Checks recipient address matches platform wallet
- Enforces minimum deposit ($10)
- Prevents double-spending via `txHash` uniqueness

### 3. Confirmation Requirements

- Waits for 12 confirmations on Arbitrum (~3 minutes)
- Prevents chain reorganization attacks
- Adjustable via `CONFIRMATIONS_REQUIRED` constant

### 4. Balance Tracking

- `internalBalance`: User's credited balance in database
- Checked before every trade
- Synced with Orderly account balance

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deposit/address` | Get platform deposit address |
| POST | `/api/deposit/verify` | Verify and link deposit to user |
| GET | `/api/deposit/status/:txHash` | Check deposit status |
| GET | `/api/deposit/:handle/history` | Get user deposit history |

## Trading with Deposited Funds

After deposit is credited:

1. User tweets: `@YourBot long BTC 100 x5`
2. System checks `user.internalBalance >= 100`
3. If sufficient, places order on Orderly
4. If insufficient, replies: `Insufficient balance. Deposit more at...`

## Monitoring & Operations

### Check Platform Wallet Balance

```bash
# USDC balance
curl "https://arb1.arbitrum.io/rpc" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      "data": "0x70a08231000000000000000000000000<PLATFORM_WALLET_ADDRESS>"
    }, "latest"],
    "id": 1
  }'
```

### Retry Failed Deposits

Failed deposits are logged with `status: 'failed'` and `errorMessage`.

To manually retry:

```typescript
// In Firestore console or via script
const deposit = await dbService.getDepositById('failed-deposit-id');
// Fix issue (e.g., fund platform wallet with ETH for gas)
// Update status back to 'confirmed'
await dbService.updateDepositStatus(deposit.id, 'confirmed', {
  retryCount: 0,
  errorMessage: null
});
// Worker will retry on next scan
```

### Logs to Monitor

```bash
# Successful deposit
💰 New deposit: 100 USDC from 0xabc...
   Tx: 0x123...
✅ Deposit recorded: deposit-id-123
   Status: confirmed (15/12 confirmations)
✅ Credited internal balance: alice
✅ Credited Orderly account: account-id-456
✅ Deposit fully processed: 0x123...

# Failed deposit
❌ Error crediting deposit deposit-id-789: Insufficient ETH for gas
🚨 ALERT: Deposit deposit-id-789 failed 4 times!
```

## Troubleshooting

### "Deposit detected but crediting failed"

**Cause**: Orderly API error or platform wallet out of ETH for gas.

**Fix**:
1. Check platform wallet ETH balance
2. Fund if necessary
3. Check Orderly broker API credentials
4. Retry will happen automatically

### "Invalid deposit transaction"

**Cause**: User sent to wrong address, wrong token, or insufficient amount.

**Fix**:
- Verify user sent USDC (not ETH or other token)
- Verify user sent to correct platform address
- Check amount >= $10 USDC

### "Transaction not found"

**Cause**: User provided wrong tx hash or transaction pending/failed.

**Fix**:
- Verify tx hash is correct
- Check tx on [Arbiscan](https://arbiscan.io)
- Ensure tx was successful (not reverted)

## Testing

### Testnet Setup

For testing, use Arbitrum Goerli:

```env
ARBITRUM_RPC_URL=https://goerli-rollup.arbitrum.io/rpc
USDC_CONTRACT_ADDRESS=0x... # Testnet USDC
ORDERLY_CHAIN_ID=421613
```

Get testnet USDC from faucets.

### Manual Test

1. Setup platform wallet: `npm run setup-wallet`
2. Send testnet USDC to platform address
3. Call verify endpoint with tx hash
4. Check user balance: `GET /api/balance/:handle`
5. Try trading: Tweet `@YourBot long BTC 10 x2`

## Future Enhancements

- [ ] Webhook notifications when deposit is credited
- [ ] Email/SMS alerts for large deposits
- [ ] Support multiple networks (Ethereum, Polygon, etc.)
- [ ] Withdrawal system (reverse flow)
- [ ] Admin dashboard for deposit monitoring
- [ ] Automatic conversion (receive ETH, convert to USDC)
- [ ] Batch processing for gas optimization

## Support

For issues:
- Check logs in deposit monitor worker
- Verify environment variables
- Ensure platform wallet has ETH for gas
- Contact Orderly Network for broker API support

---

**Built with ❤️ for XPerps**
