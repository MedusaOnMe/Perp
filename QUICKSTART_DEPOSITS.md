# Quick Start: Deposits

## TL;DR - Get Deposits Working in 5 Minutes

### 1. Setup (One Time)

```bash
# Install & build
npm install
npm run build

# Generate platform wallet
npm run setup-wallet

# Copy the private key it prints, add to .env:
echo "PLATFORM_WALLET_PRIVATE_KEY=0x..." >> .env

# Also add these to .env:
echo "ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc" >> .env
echo "USDC_CONTRACT_ADDRESS=0xaf88d065e77c8cC2239327C5EDb3A432268e5831" >> .env
```

### 2. Fund Platform Wallet

```bash
# Send 0.1 ETH to the platform wallet address (shown in setup-wallet output)
# On Arbitrum network
```

### 3. Run

```bash
# Option A: Run all services
npm run start:all

# Option B: Run individually (4 terminals)
npm run dev                        # Terminal 1
npm run worker:tweet-listener       # Terminal 2
npm run worker:export-monitor       # Terminal 3
npm run worker:deposit-monitor      # Terminal 4

# Option C: Docker
docker-compose up -d
```

### 4. Test

```bash
# Get deposit address
curl http://localhost:3000/api/deposit/address

# User sends USDC to that address on Arbitrum

# After sending, verify the deposit:
curl -X POST http://localhost:3000/api/deposit/verify \
  -H "Content-Type: application/json" \
  -d '{"twitterHandle": "alice", "txHash": "0x..."}'

# Check status (wait ~3 min for 12 confirmations):
curl http://localhost:3000/api/deposit/status/0x...

# Check user balance:
curl http://localhost:3000/api/balance/alice
```

### 5. Trade

```bash
# User tweets:
@YourBot long BTC 10 x2

# System now checks balance before executing!
```

## How It Works

```
User → Sends USDC → Platform Wallet → Verifies → Credits User → User Trades
         (Arbitrum)     (Monitored)      (12 conf)   (Orderly)    (via tweets)
```

## New Environment Variables

```env
# Add these to your .env:
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
USDC_CONTRACT_ADDRESS=0xaf88d065e77c8cC2239327C5EDb3A432268e5831
PLATFORM_WALLET_PRIVATE_KEY=0xyour-key-from-setup-wallet
```

## Frontend Integration

```javascript
// 1. Show deposit address to user
const { address } = await fetch('/api/deposit/address').then(r => r.json());

// 2. User sends USDC (via MetaMask, etc.)

// 3. User submits tx hash
await fetch('/api/deposit/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ twitterHandle: 'alice', txHash: '0x...' })
});

// 4. Poll for status
const checkStatus = async () => {
  const { status } = await fetch(`/api/deposit/status/${txHash}`).then(r => r.json());
  if (status === 'credited') {
    alert('Deposit successful!');
  } else {
    setTimeout(checkStatus, 5000); // Check again in 5s
  }
};
checkStatus();
```

## Troubleshooting

**"Platform wallet not configured"**
→ Run `npm run setup-wallet`

**"Insufficient ETH for gas"**
→ Send ETH to platform wallet address

**"Deposit not credited after 10 min"**
→ Check deposit-monitor logs for errors

**"Transaction not found"**
→ Verify tx hash is correct and transaction succeeded

## Production Checklist

Before going live:

- [ ] Test on Arbitrum Goerli testnet first
- [ ] Move private key to AWS Secrets Manager (not .env)
- [ ] Fund platform wallet with 0.5+ ETH for gas
- [ ] Set up monitoring/alerts
- [ ] Test with small $10 deposit
- [ ] Monitor logs for 24 hours
- [ ] Enable Firestore security rules

## What Changed?

**New Files:**
- `src/services/blockchain.service.ts` - Blockchain scanning
- `src/api/routes/deposit.ts` - Deposit endpoints
- `src/workers/deposit-monitor.ts` - Monitors deposits
- `src/models/deposit.ts` - Deposit models
- `scripts/setup-platform-wallet.ts` - Setup script

**Updated:**
- `src/workers/tweet-listener.ts` - Now checks balance before trades
- `src/app.ts` - Added deposit routes
- `src/services/orderly.service.ts` - Added credit methods
- `docker-compose.yml` - Added deposit-monitor service

## Need Help?

- Full docs: See `DEPOSIT_SYSTEM.md`
- Implementation details: See `DEPOSIT_IMPLEMENTATION_SUMMARY.md`
- Original README: See `README.md`

---

**That's it! Deposits are now live. 💰**
