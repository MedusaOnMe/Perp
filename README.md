# XPerps - Twitter-Controlled Perpetual Trading Platform

A custodial perpetual trading platform where users control their trades via tweets, powered by Orderly Network.

## Features

- Tweet-based authentication (no OAuth required)
- Custodial trading accounts on Orderly Network
- Trade perps with simple tweets: `@YourBot long BTC 100 USDC x5`
- Secure wallet export via tweet verification
- AES-256-GCM encryption for all private keys
- Position and leverage limits for safety

## Architecture

```
Twitter → Tweet Listener → Orderly Network → Firestore
              ↓
         Command Parser
              ↓
      Trade Executor (Direct)
```

## Prerequisites

- Node.js 18+
- Firebase/Firestore project
- RapidAPI account (Twitter154 API)
- Orderly Network broker account

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Master Encryption Key

```bash
npm run generate-key
```

This will output a 64-character hex string. **Save this securely!**

### 3. Configure Firebase

1. Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Download service account key:
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `serviceAccountKey.json` in project root

### 4. Get API Keys

**Twitter154 RapidAPI:**
1. Sign up at [https://rapidapi.com](https://rapidapi.com)
2. Subscribe to Twitter154 API: [https://rapidapi.com/datahungrybeast/api/twitter154](https://rapidapi.com/datahungrybeast/api/twitter154)
3. Copy your RapidAPI key

**Orderly Network:**
1. Register as a broker at [https://orderly.network](https://orderly.network)
2. Get your broker ID

### 5. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Encryption (from step 2)
MASTER_ENCRYPTION_KEY=your-64-char-hex-key

# Twitter API
RAPIDAPI_KEY=your-rapidapi-key
TWITTER_BOT_HANDLE=YourBotName

# Firestore
FIRESTORE_PROJECT_ID=your-firebase-project-id
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Orderly Network
ORDERLY_API_URL=https://api-evm.orderly.org
ORDERLY_BROKER_ID=your-broker-id
ORDERLY_CHAIN_ID=42161

# Server
PORT=3000
NODE_ENV=production
```

## Development

### Build

```bash
npm run build
```

### Run API Server

```bash
npm run dev
```

Server runs on [http://localhost:3000](http://localhost:3000)

### Run Tweet Listener Worker

In a separate terminal:

```bash
npm run worker:tweet-listener
```

This polls Twitter every 10 seconds for mentions.

### Run Export Monitor Worker

In a third terminal:

```bash
npm run worker:export-monitor
```

This monitors tweet-based wallet export confirmations.

## Production Deployment

### Option 1: Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init

# Add environment variables
railway variables set MASTER_ENCRYPTION_KEY=xxx
railway variables set RAPIDAPI_KEY=xxx
# ... (add all .env variables)

# Deploy
railway up
```

### Option 2: Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Add environment variables
5. Set build command: `npm install && npm run build`
6. Set start command: `npm start`

### Option 3: Docker

```bash
# Build
docker build -t xperps-backend .

# Run
docker run -p 3000:3000 --env-file .env xperps-backend
```

## Usage

### User Registration

Tweet:
```
@YourBot register
```

Response:
```
✅ Registered! Account: 0x1234... | Wallet: 0xabcd...
```

### Open Long Position

Tweet:
```
@YourBot long BTC 100 USDC x5
```

Response:
```
✅ LONG BTC: 0.0022 @ $45000 x5
```

### Open Short Position

Tweet:
```
@YourBot short ETH 50 x3
```

### Close Position

Tweet:
```
@YourBot close BTC
```

Response:
```
✅ Closed BTC: 0.0022 | PnL: +12.50 USDC
```

### Check Balance

Tweet:
```
@YourBot balance
```

Response:
```
💰 Balance: 112.50 USDC | Open: 1 | PnL: +5.00
```

### Export Wallet

1. Request export via API:
```bash
curl -X POST http://localhost:3000/api/export/request \
  -H "Content-Type: application/json" \
  -d '{"twitterHandle": "username"}'
```

Response:
```json
{
  "code": "123456",
  "secretPath": "a7f3e2...",
  "expiresIn": 300,
  "message": "Tweet: @YourBot export 123456"
}
```

2. Tweet the code:
```
@YourBot export 123456
```

3. Fetch private key (one-time read, 30 sec TTL):
```bash
curl http://localhost:3000/api/export/a7f3e2...
```

## API Endpoints

### Health Check
```
GET /health
```

### Request Wallet Export
```
POST /api/export/request
Body: { "twitterHandle": "username" }
```

### Check Export Status
```
GET /api/export/status/:secretPath
```

### Get Exported Key
```
GET /api/export/:secretPath
```

### Get Balance
```
GET /api/balance/:twitterHandle
```

### Get Order History
```
GET /api/balance/:twitterHandle/orders?limit=50
```

## Security

- All private keys encrypted with AES-256-GCM
- Master encryption key stored in environment (use secrets manager in production)
- 30-second TTL on exported keys
- One-time read on key exports
- Tweet replay protection via `processed_tweets` collection
- Username normalization to prevent impersonation
- Position and leverage limits
- Daily volume limits per user

## Risk Limits

```typescript
maxPositionSize: $1000 per position
maxLeverage: 10x
maxOpenPositions: 5 concurrent
minOrderSize: $10
maxDailyVolume: $5000 per user per day
```

## Firestore Collections

- `users` - User accounts and encrypted keys
- `orders` - Order history
- `positions` - Position tracking
- `processed_tweets` - Replay attack prevention
- `pending_exports` - Export requests (5 min TTL)
- `key_exports` - Exported keys (30 sec TTL)

## Monitoring

Monitor these logs in production:

```bash
# Tweet processing
[2025-01-01T12:00:00Z] Processing tweet from @user: "long BTC 100 x5"
✅ Success: LONG BTC: 0.0022 @ $45000 x5

# Errors
❌ Error processing tweet: Max leverage 10x
❌ Poll error: Twitter API timeout
```

## Troubleshooting

### "Twitter API error"
- Check RAPIDAPI_KEY is valid
- Verify Twitter154 subscription is active

### "Orderly registration error"
- Verify ORDERLY_BROKER_ID is correct
- Check network connectivity

### "Firestore not initialized"
- Ensure serviceAccountKey.json exists
- Verify FIRESTORE_PROJECT_ID matches your project

### "Decryption failed"
- MASTER_ENCRYPTION_KEY may have changed
- Cannot recover old encrypted keys if key is lost

## License

MIT

## Support

For issues and questions, create an issue on GitHub.
