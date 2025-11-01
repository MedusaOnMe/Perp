import dotenv from 'dotenv';
import { initializeFirebase } from '../../config/firebase';
import { twitterService } from '../services/twitter.service';
import { parserService } from '../services/parser.service';
import { dbService } from '../services/db.service';
import { walletService } from '../services/wallet.service';
import { orderlyService } from '../services/orderly.service';
import { decrypt } from '../services/encryption.service';
import { LIMITS } from '../models/types';
import { Timestamp } from 'firebase-admin/firestore';

// Load environment
dotenv.config();

// Initialize Firebase
initializeFirebase();

const POLL_INTERVAL = 45000; // 45 seconds
const BOT_HANDLE = process.env.TWITTER_BOT_HANDLE || '';

// ========== COMMAND HANDLERS ==========

async function handleRegister(twitterHandle: string, tweetId: string): Promise<string> {
  // Check if user already exists
  const existingUser = await dbService.getUserByHandle(twitterHandle);
  if (existingUser) {
    const balance = existingUser.internalBalance;
    return `✅ Already registered! Account ID: ${existingUser.accountId.slice(0, 8)}... | Balance: ${balance} USDC`;
  }

  // Generate wallet keys
  console.log(`Generating keys for new user: ${twitterHandle}`);
  const keys = await walletService.generateUserKeys();

  // Register account on Orderly Network
  console.log(`Registering account on Orderly...`);
  const walletPrivateKey = decrypt(keys.encryptedWalletPrivateKey);
  const accountId = await orderlyService.registerAccount(keys.walletAddress, walletPrivateKey);

  // Create user in database
  await dbService.createUser({
    twitterHandle,
    twitterUserId: tweetId, // Using tweet ID as placeholder
    accountId,
    walletAddress: keys.walletAddress,
    encryptedWalletPrivateKey: keys.encryptedWalletPrivateKey,
    encryptedOrderlyPrivateKey: keys.encryptedOrderlyPrivateKey,
    encryptedTradingPrivateKey: keys.encryptedTradingPrivateKey,
    orderlyPublicKey: keys.orderlyPublicKey,
    orderlyTradingPublicKey: keys.orderlyTradingPublicKey,
    createdAt: Timestamp.now(),
    lastActivityAt: Timestamp.now(),
    status: 'active',
    internalBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0
  });

  console.log(`✅ User registered: ${twitterHandle} -> ${accountId}`);
  return `✅ Registered! Account: ${accountId.slice(0, 8)}... | Wallet: ${keys.walletAddress.slice(0, 8)}...`;
}

async function handleTrade(
  command: any,
  twitterHandle: string,
  tweetId: string
): Promise<string> {
  // Get user
  const user = await dbService.getUserByHandle(twitterHandle);
  if (!user) {
    throw new Error('Not registered. Tweet: @' + BOT_HANDLE + ' register');
  }

  // Validate trade
  if (command.amount > LIMITS.maxPositionSize) {
    throw new Error(`Max position size: $${LIMITS.maxPositionSize}`);
  }

  if (command.amount < LIMITS.minOrderSize) {
    throw new Error(`Min order size: $${LIMITS.minOrderSize}`);
  }

  if (command.leverage > LIMITS.maxLeverage) {
    throw new Error(`Max leverage: ${LIMITS.maxLeverage}x`);
  }

  // Check daily volume
  const todayVolume = await dbService.getTodayVolume(user.id);
  if (todayVolume + command.amount > LIMITS.maxDailyVolume) {
    throw new Error(`Daily volume limit reached: $${LIMITS.maxDailyVolume}`);
  }

  // Check user has sufficient balance
  if (user.internalBalance < command.amount) {
    throw new Error(
      `Insufficient balance. Available: $${user.internalBalance.toFixed(2)} USDC. ` +
      `Deposit more at: https://yourplatform.com/deposit`
    );
  }

  // Decrypt keys
  const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);
  const tradingPrivateKey = decrypt(user.encryptedTradingPrivateKey);

  // Get symbol and current price
  const symbol = parserService.toOrderlySymbol(command.asset);
  const markPrice = await orderlyService.getMarkPrice(symbol);

  // Calculate quantity
  const quantity = (command.amount / markPrice) * command.leverage;

  // Determine side
  const side = command.type === 'long' ? 'BUY' : 'SELL';

  // Place order
  console.log(`Placing ${command.type} order: ${symbol} ${quantity} @ ${markPrice}`);
  const orderResponse = await orderlyService.placeOrder(
    {
      accountId: user.accountId,
      symbol,
      side,
      orderType: 'MARKET',
      quantity
    },
    orderlyPrivateKey,
    tradingPrivateKey
  );

  // Save order to DB
  await dbService.saveOrder({
    userId: user.id,
    twitterHandle,
    tweetId,
    orderlyOrderId: orderResponse.data.order_id,
    symbol,
    side,
    orderType: 'MARKET',
    quantity,
    leverage: command.leverage,
    status: 'filled',
    filledQuantity: quantity,
    avgFillPrice: markPrice,
    fees: 0,
    createdAt: Timestamp.now()
  });

  return `✅ ${command.type.toUpperCase()} ${command.asset}: ${quantity.toFixed(4)} @ $${markPrice.toFixed(2)} x${command.leverage}`;
}

async function handleClose(asset: string, twitterHandle: string, tweetId: string): Promise<string> {
  // Get user
  const user = await dbService.getUserByHandle(twitterHandle);
  if (!user) {
    throw new Error('Not registered.');
  }

  // Decrypt keys
  const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);
  const tradingPrivateKey = decrypt(user.encryptedTradingPrivateKey);

  // Get positions
  const positions = await orderlyService.getPositions(user.accountId, orderlyPrivateKey);
  const symbol = parserService.toOrderlySymbol(asset);
  const position = positions.find(p => p.symbol === symbol);

  if (!position || position.position_qty === 0) {
    throw new Error(`No open position for ${asset}`);
  }

  // Determine side (opposite of current position)
  const side = position.position_qty > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(position.position_qty);

  // Close position
  console.log(`Closing position: ${symbol} ${quantity}`);
  const orderResponse = await orderlyService.closePosition(
    {
      accountId: user.accountId,
      symbol,
      side,
      orderType: 'MARKET',
      quantity
    },
    orderlyPrivateKey,
    tradingPrivateKey
  );

  // Save order
  await dbService.saveOrder({
    userId: user.id,
    twitterHandle,
    tweetId,
    orderlyOrderId: orderResponse.data.order_id,
    symbol,
    side,
    orderType: 'MARKET',
    quantity,
    leverage: 1,
    status: 'filled',
    filledQuantity: quantity,
    fees: 0,
    createdAt: Timestamp.now()
  });

  // Mark position as closed in DB
  const positionId = `${user.id}_${symbol}`;
  await dbService.closePosition(positionId);

  const pnl = position.unsettled_pnl || 0;
  return `✅ Closed ${asset}: ${quantity.toFixed(4)} | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDC`;
}

async function handleBalance(twitterHandle: string): Promise<string> {
  // Get user
  const user = await dbService.getUserByHandle(twitterHandle);
  if (!user) {
    throw new Error('Not registered.');
  }

  // Decrypt key
  const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);

  // Get balance and positions
  const balance = await orderlyService.getBalance(user.accountId, orderlyPrivateKey);
  const positions = await orderlyService.getPositions(user.accountId, orderlyPrivateKey);

  const totalPnl = positions.reduce((sum, pos) => sum + (pos.unsettled_pnl || 0), 0);
  const available = balance.holding - balance.frozen;

  let response = `💰 Balance: ${available.toFixed(2)} USDC`;
  if (positions.length > 0) {
    response += ` | Open: ${positions.length} | PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}`;
  }

  return response;
}

// ========== MAIN POLLING LOOP ==========

async function pollTwitter() {
  try {
    console.log(`[${new Date().toISOString()}] Polling Twitter...`);

    // Fetch mentions
    const tweets = await twitterService.getMentions(50);

    if (tweets.length === 0) {
      console.log('No new mentions');
      return;
    }

    console.log(`Found ${tweets.length} mentions`);

    // Process each tweet
    for (const tweet of tweets) {
      // Skip if already processed
      const processed = await dbService.isProcessed(tweet.id);
      if (processed) {
        continue;
      }

      const handle = parserService.normalizeHandle(tweet.author.username);
      console.log(`\n📨 Processing tweet from @${handle}: "${tweet.text}"`);

      try {
        // Parse command
        const command = parserService.parseCommand(tweet.text);
        parserService.validateCommand(command);

        let responseMessage = '';

        // Execute command
        switch (command.type) {
          case 'register':
            responseMessage = await handleRegister(handle, tweet.id);
            break;

          case 'long':
          case 'short':
            responseMessage = await handleTrade(command, handle, tweet.id);
            break;

          case 'close':
            responseMessage = await handleClose(command.asset!, handle, tweet.id);
            break;

          case 'balance':
            responseMessage = await handleBalance(handle);
            break;

          case 'export':
            // Export is handled by export-monitor worker
            responseMessage = 'Export requests are handled separately';
            break;

          default:
            throw new Error('Unknown command');
        }

        // Mark as processed
        await dbService.markProcessed(tweet.id, handle, handle, tweet.text, 'success');

        // Reply to tweet
        await twitterService.reply(tweet.id, responseMessage);

        console.log(`✅ Success: ${responseMessage}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error processing tweet: ${errorMsg}`);

        // Mark as processed with error
        await dbService.markProcessed(tweet.id, handle, handle, tweet.text, 'error', errorMsg);

        // Reply with error
        await twitterService.reply(tweet.id, `❌ Error: ${errorMsg}`);
      }
    }

  } catch (error) {
    console.error('❌ Poll error:', error);
  }
}

// ========== START WORKER ==========

console.log('🚀 Starting Tweet Listener Worker...');
console.log(`📊 Polling interval: ${POLL_INTERVAL / 1000}s`);
console.log(`🐦 Bot handle: @${BOT_HANDLE}`);

// Initial poll
pollTwitter();

// Set interval
setInterval(pollTwitter, POLL_INTERVAL);
