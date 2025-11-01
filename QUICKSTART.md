# XPerps - Quick Start Guide

Get your Twitter-controlled perps trading bot running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Firebase account (free tier works)
- RapidAPI account
- Orderly Network broker registration

## Step-by-Step Setup

### 1. Clone & Install

```bash
cd XPerps
npm install
```

### 2. Generate Encryption Key

```bash
npm run generate-key
```

Copy the generated key (you'll need it in step 4).

### 3. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project → Enable Firestore
3. Project Settings → Service Accounts → Generate New Private Key
4. Save the JSON file as `serviceAccountKey.json` in project root

### 4. Get API Keys

**RapidAPI (Twitter):**
- Sign up at [rapidapi.com](https://rapidapi.com)
- Subscribe to [Twitter154](https://rapidapi.com/datahungrybeast/api/twitter154)
- Copy your API key

**Orderly Network:**
- Contact Orderly Network for broker registration
- Get your broker ID

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
MASTER_ENCRYPTION_KEY=<paste-from-step-2>
RAPIDAPI_KEY=<your-rapidapi-key>
TWITTER_BOT_HANDLE=YourBotName
FIRESTORE_PROJECT_ID=<your-firebase-project-id>
ORDERLY_BROKER_ID=<your-broker-id>
ORDERLY_API_URL=https://api-evm.orderly.org
ORDERLY_CHAIN_ID=42161
PORT=3000
NODE_ENV=development
```

### 6. Build

```bash
npm run build
```

### 7. Run (3 Terminals)

**Terminal 1 - API Server:**
```bash
npm run dev
```

**Terminal 2 - Tweet Listener:**
```bash
npm run worker:tweet-listener
```

**Terminal 3 - Export Monitor:**
```bash
npm run worker:export-monitor
```

## Test It

1. Tweet at your bot:
```
@YourBotName register
```

2. Wait for confirmation (bot will reply in ~10 seconds)

3. Check balance:
```
@YourBotName balance
```

4. Make a trade:
```
@YourBotName long BTC 10 USDC x2
```

## Production Deployment

### Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

This starts all 3 services automatically.

### Using Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Don't forget to add environment variables in Railway dashboard!

## Common Issues

**"Twitter API error"**
- Check your RapidAPI subscription is active
- Verify RAPIDAPI_KEY in .env

**"Firebase not initialized"**
- Ensure serviceAccountKey.json exists
- Check FIRESTORE_PROJECT_ID matches your project

**"No mentions found"**
- Twitter154 API may have delays (up to 30 seconds)
- Make sure you're mentioning the correct bot handle

## Next Steps

- Set up monitoring/logging
- Configure alerts for errors
- Add more position limits
- Implement withdrawal system
- Add KYC if required

## Support

Create an issue on GitHub or check the main README.md for detailed documentation.

Happy trading! 🚀
