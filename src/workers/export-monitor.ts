import dotenv from 'dotenv';
import { initializeFirebase } from '../../config/firebase';
import { twitterService } from '../services/twitter.service';
import { parserService } from '../services/parser.service';
import { dbService } from '../services/db.service';
import { decrypt } from '../services/encryption.service';

// Load environment
dotenv.config();

// Initialize Firebase
initializeFirebase();

const POLL_INTERVAL = 10000; // 10 seconds
const BOT_HANDLE = process.env.TWITTER_BOT_HANDLE || '';

/**
 * Monitor for export confirmation tweets
 */
async function monitorExports() {
  try {
    console.log(`[${new Date().toISOString()}] Monitoring export tweets...`);

    // Fetch mentions
    const tweets = await twitterService.getMentions(50);

    if (tweets.length === 0) {
      return;
    }

    // Process each tweet
    for (const tweet of tweets) {
      const handle = parserService.normalizeHandle(tweet.author.username);

      try {
        // Try to parse as export command with code
        const command = parserService.parseCommand(tweet.text);

        // Only process export commands with codes
        if (command.type !== 'export' || !command.code) {
          continue;
        }

        // Skip if already processed
        const processed = await dbService.isProcessed(tweet.id);
        if (processed) {
          continue;
        }

        console.log(`\n🔑 Export request from @${handle} with code: ${command.code}`);

        // Find pending export matching code and handle
        const pendingExport = await dbService.getPendingExportByCode(command.code, handle);

        if (!pendingExport) {
          console.log(`❌ No pending export found for code ${command.code} and handle @${handle}`);
          await twitterService.reply(tweet.id, '❌ Invalid or expired export code');
          continue;
        }

        // Check if expired
        if (pendingExport.expiresAt.toMillis() < Date.now()) {
          console.log(`❌ Export code expired`);

          await dbService.updatePendingExportStatus(pendingExport.id, 'expired');
          await dbService.markProcessed(
            tweet.id,
            pendingExport.userId,
            handle,
            tweet.text,
            'error',
            'Export code expired'
          );

          await twitterService.reply(tweet.id, '❌ Export code expired. Please request a new one.');
          continue;
        }

        // Get user
        const user = await dbService.getUserById(pendingExport.userId);
        if (!user) {
          throw new Error('User not found');
        }

        // Decrypt wallet private key
        const walletPrivateKey = decrypt(user.encryptedWalletPrivateKey);

        // Store in key_exports collection with 30 second TTL
        await dbService.createKeyExport(pendingExport.secretPath, walletPrivateKey, 30);

        // Mark pending export as completed
        await dbService.updatePendingExportStatus(pendingExport.id, 'completed');

        // Mark tweet as processed
        await dbService.markProcessed(
          tweet.id,
          user.id,
          handle,
          tweet.text,
          'success'
        );

        console.log(`✅ Export ready at: /api/export/${pendingExport.secretPath}`);

        await twitterService.reply(
          tweet.id,
          `✅ Export ready! Check your app for the private key. ⚠️ Available for 30 seconds only.`
        );

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error processing export: ${errorMsg}`);
      }
    }

  } catch (error) {
    console.error('❌ Export monitor error:', error);
  }
}

// ========== START WORKER ==========

console.log('🔑 Starting Export Monitor Worker...');
console.log(`📊 Polling interval: ${POLL_INTERVAL / 1000}s`);
console.log(`🐦 Bot handle: @${BOT_HANDLE}`);

// Initial check
monitorExports();

// Set interval
setInterval(monitorExports, POLL_INTERVAL);
