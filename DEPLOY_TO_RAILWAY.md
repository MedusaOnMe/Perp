# Deploy to Railway - Complete Guide

## 🚀 Deploy Your Full Stack App in 5 Minutes

This guide walks you through deploying your complete XPerps platform (frontend + backend + workers) to Railway.

## Prerequisites

- ✅ GitHub account
- ✅ Railway account (sign up at railway.app)
- ✅ Your code pushed to GitHub

## Step 1: Push to GitHub

```bash
# Make sure everything is committed
git add .
git commit -m "Add frontend and complete deposit system"
git push origin main
```

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your **Perp** repository
5. Railway will auto-detect it's a Node.js app

## Step 3: Configure Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```env
# Encryption
MASTER_ENCRYPTION_KEY=579e3a46c388291ccca032a64c51bc53116d2ad3639c13f898bdd6fd529e13f3

# Twitter API
RAPIDAPI_KEY=722514577bmshdc5d2d3223672fdp142083jsne0a58215a6a1
TWITTER_BOT_HANDLE=YourBotName

# Firestore
FIRESTORE_PROJECT_ID=bonkpot-4c8aa
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Orderly Network
ORDERLY_API_URL=https://api-evm.orderly.org
ORDERLY_BROKER_ID=woofi_dex
ORDERLY_CHAIN_ID=42161

# Blockchain (Arbitrum)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
USDC_CONTRACT_ADDRESS=0xaf88d065e77c8cC2239327C5EDb3A432268e5831
PLATFORM_WALLET_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

# Server
PORT=3000
NODE_ENV=production
```

## Step 4: Upload Firebase Service Account

Railway needs your `serviceAccountKey.json`. Two options:

### Option A: Base64 Encode (Recommended)

```bash
# On your machine
base64 serviceAccountKey.json | tr -d '\n' > key.txt

# Copy contents of key.txt
cat key.txt
```

Then in Railway:
1. Add variable: `FIREBASE_KEY_BASE64`
2. Paste the base64 string
3. Update your code to decode it on startup

### Option B: Use Railway Volumes

1. Railway → **Settings** → **Volumes**
2. Create volume mounted at `/app/serviceAccountKey.json`
3. Upload your JSON file

**For now, Option A is easier.**

## Step 5: Add Startup Script

Railway will automatically use your `package.json` scripts:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/app.js"
  }
}
```

Railway runs:
1. `npm install`
2. `npm run build`
3. `npm start`

## Step 6: Deploy Workers

Railway allows multiple services per project. Create 3 more services:

### Tweet Listener

1. **New Service** → From GitHub repo
2. **Start Command**: `node dist/workers/tweet-listener.js`
3. Copy environment variables from main service

### Export Monitor

1. **New Service** → From GitHub repo
2. **Start Command**: `node dist/workers/export-monitor.js`
3. Copy environment variables

### Deposit Monitor

1. **New Service** → From GitHub repo
2. **Start Command**: `node dist/workers/deposit-monitor.js`
3. Copy environment variables

## Step 7: Generate Platform Wallet

⚠️ **IMPORTANT**: Generate platform wallet after deploying API:

```bash
# SSH into Railway container (or run locally)
npm run setup-wallet

# Copy the private key output
# Add to Railway env: PLATFORM_WALLET_PRIVATE_KEY
```

## Step 8: Test Deployment

Your Railway URL will be something like:
```
https://perp-production.up.railway.app
```

Test:
1. Visit the URL → Should see landing page ✅
2. Visit `/health` → Should return `{"status": "ok"}` ✅
3. Visit `/api/deposit/address` → Should return deposit address ✅
4. Try dashboard → Enter Twitter handle and check balance

## Troubleshooting

### "Cannot find module" errors

Make sure `public` folder is included in deployment:
- Check `.gitignore` doesn't exclude `public/`
- Railway should copy everything except `node_modules`

### "Firebase not initialized"

Railway can't find `serviceAccountKey.json`:
- Use base64 method (Option A above)
- Or configure volume mounting correctly

### Workers not processing

Check Railway logs:
- Each worker should be a separate service
- Each should have same environment variables
- Check they're running (not crashed)

### Deposit monitor not working

1. Verify `ARBITRUM_RPC_URL` is set
2. Check `PLATFORM_WALLET_PRIVATE_KEY` is valid
3. Monitor logs for errors

## Monitoring

Railway provides:
- **Logs** for each service
- **Metrics** (CPU, memory, network)
- **Deployments** history

Set up alerts for:
- Service crashes
- High error rates
- Memory/CPU spikes

## Cost Estimate

Railway pricing (as of 2024):
- **Hobby Plan**: $5/month
  - 1 service free
  - Additional services: $5/service
  - Total for 4 services: ~$20/month

- **Pro Plan**: $20/month
  - Better resources
  - Priority support

## Custom Domain

1. Railway → **Settings** → **Domains**
2. Add your domain: `trade.yourdomain.com`
3. Update DNS:
   ```
   CNAME trade -> [your-railway-url]
   ```
4. SSL certificate auto-generated

## Scaling

Railway auto-scales within plan limits. For high traffic:
- Upgrade to Pro plan
- Use Railway's horizontal scaling
- Consider Redis for caching (add as service)

## Backup Strategy

1. **Firestore**: Enable daily backups in Firebase Console
2. **Environment Variables**: Store securely in password manager
3. **Code**: GitHub is your source of truth

## Security Checklist

Before going live:

- [ ] All secrets in Railway env variables (not code)
- [ ] `serviceAccountKey.json` not in Git
- [ ] `.env` not in Git (already in `.gitignore`)
- [ ] Platform wallet has ETH for gas
- [ ] Test deposit flow end-to-end
- [ ] Test wallet export flow
- [ ] Monitor logs for errors

## Post-Deployment

### Update Frontend Bot Handle

After deploying, update bot handle in:
1. Frontend code (`/public/app.js`)
2. All documentation
3. Social media

### Setup Monitoring

1. **Railway Dashboard**: Check daily
2. **Sentry**: Add for error tracking
3. **Uptime Monitor**: Use UptimeRobot (free)

### Test Everything

- [ ] Register via tweet
- [ ] Deposit USDC
- [ ] Open position via tweet
- [ ] Close position
- [ ] Check balance on dashboard
- [ ] Export wallet

## Support

If stuck:
- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
- **This repo**: Check issues

## Next Steps

1. **Test on testnet first** (Arbitrum Goerli)
2. **Deploy to mainnet** when confident
3. **Monitor for 24 hours**
4. **Announce launch** 🎉

---

**You're ready to deploy! Railway makes it stupid simple.**

Push to GitHub → Connect to Railway → Add env vars → Done! 🚀
