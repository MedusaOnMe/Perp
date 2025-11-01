import dotenv from 'dotenv';
import { initializeFirebase } from '../../config/firebase';
import { dbService } from '../services/db.service';
import { blockchainService } from '../services/blockchain.service';
import { orderlyService } from '../services/orderly.service';
import { decrypt } from '../services/encryption.service';
import { Timestamp } from 'firebase-admin/firestore';

// Load environment
dotenv.config();

// Initialize Firebase
initializeFirebase();

const SCAN_INTERVAL = 30000; // 30 seconds
const CONFIRMATIONS_REQUIRED = 12;

/**
 * Scan blockchain for new deposits to platform wallet
 */
async function scanForNewDeposits() {
  try {
    console.log(`[${new Date().toISOString()}] Scanning for new deposits...`);

    // Get platform wallet
    const platformWallet = await dbService.getPlatformWallet();
    if (!platformWallet) {
      console.error('❌ Platform wallet not configured!');
      return;
    }

    // Get current block
    const currentBlock = await blockchainService.getCurrentBlock();

    // Scan from last scanned block to current
    const fromBlock = platformWallet.lastScannedBlock + 1;
    const toBlock = currentBlock;

    if (fromBlock > toBlock) {
      console.log('No new blocks to scan');
      return;
    }

    console.log(`Scanning blocks ${fromBlock} to ${toBlock}...`);

    // Scan for USDC transfers to platform address
    const deposits = await blockchainService.scanForDeposits(
      platformWallet.address,
      fromBlock,
      toBlock
    );

    console.log(`Found ${deposits.length} potential deposits`);

    // Process each deposit
    for (const deposit of deposits) {
      try {
        // Check if already processed
        const existing = await dbService.getDepositByTxHash(deposit.txHash);
        if (existing) {
          console.log(`Already processed: ${deposit.txHash}`);
          continue;
        }

        // Verify minimum amount ($10)
        if (deposit.amount < 10) {
          console.warn(`Deposit too small: ${deposit.amount} USDC in ${deposit.txHash}`);
          continue;
        }

        console.log(`\n💰 New deposit: ${deposit.amount} USDC from ${deposit.from}`);
        console.log(`   Tx: ${deposit.txHash}`);

        // Try to match to a user (this is tricky without explicit linking)
        // For now, we'll create a pending deposit and require manual user verification
        // via the /api/deposit/verify endpoint

        // Calculate confirmations
        const confirmations = currentBlock - deposit.blockNumber;
        const status = confirmations >= CONFIRMATIONS_REQUIRED ? 'confirmed' : 'pending';

        // Create deposit record (without user link - will be claimed later)
        const depositRecord = await dbService.createDeposit({
          userId: '', // Empty until user claims via /verify
          twitterHandle: '',
          txHash: deposit.txHash,
          amount: deposit.amount,
          fromAddress: deposit.from,
          toAddress: platformWallet.address,
          blockNumber: deposit.blockNumber,
          confirmations,
          requiredConfirmations: CONFIRMATIONS_REQUIRED,
          status,
          orderlyConfirmed: false,
          detectedAt: Timestamp.now(),
          retryCount: 0
        });

        console.log(`✅ Deposit recorded: ${depositRecord.id}`);
        console.log(`   Status: ${status} (${confirmations}/${CONFIRMATIONS_REQUIRED} confirmations)`);

      } catch (error) {
        console.error(`Error processing deposit ${deposit.txHash}:`, error);
      }
    }

    // Update last scanned block
    await dbService.updatePlatformWalletBlock(platformWallet.id, toBlock);
    console.log(`Updated last scanned block: ${toBlock}\n`);

  } catch (error) {
    console.error('❌ Scan error:', error);
  }
}

/**
 * Process pending deposits (update confirmations and credit when ready)
 */
async function processPendingDeposits() {
  try {
    const pending = await dbService.getPendingDeposits();

    if (pending.length === 0) {
      return;
    }

    console.log(`\n📊 Processing ${pending.length} pending deposits...`);

    for (const deposit of pending) {
      try {
        // Skip if no user linked yet
        if (!deposit.userId) {
          continue;
        }

        // Get current confirmation count
        const tx = await blockchainService.getTransaction(deposit.txHash);
        if (!tx) {
          console.warn(`Transaction not found: ${deposit.txHash}`);
          continue;
        }

        const currentBlock = await blockchainService.getCurrentBlock();
        const confirmations = currentBlock - tx.blockNumber;

        // Update confirmations
        if (confirmations !== deposit.confirmations) {
          console.log(`Updated confirmations for ${deposit.txHash}: ${confirmations}/${deposit.requiredConfirmations}`);

          if (confirmations >= deposit.requiredConfirmations && deposit.status === 'pending') {
            // Mark as confirmed
            await dbService.updateDepositStatus(deposit.id, 'confirmed', {
              confirmations
            });
          } else {
            // Just update confirmation count
            await dbService.updateDepositStatus(deposit.id, deposit.status, {
              confirmations
            });
          }
        }

        // Credit if confirmed but not yet credited
        if (confirmations >= deposit.requiredConfirmations && !deposit.orderlyConfirmed) {
          console.log(`\n💳 Crediting deposit ${deposit.id} (${deposit.amount} USDC)...`);

          try {
            // Get user
            const user = await dbService.getUserById(deposit.userId);
            if (!user) {
              throw new Error('User not found');
            }

            // Credit internal balance
            await dbService.creditUserDeposit(user.id, deposit.amount);
            console.log(`✅ Credited internal balance: ${user.twitterHandle}`);

            // Credit Orderly account
            const orderlyPrivateKey = decrypt(user.encryptedOrderlyPrivateKey);
            await orderlyService.creditAccountBalance(
              user.accountId,
              deposit.amount,
              orderlyPrivateKey
            );
            console.log(`✅ Credited Orderly account: ${user.accountId}`);

            // Mark as credited
            await dbService.updateDepositStatus(deposit.id, 'credited', {
              orderlyConfirmed: true,
              creditedAt: Timestamp.now()
            });

            console.log(`✅ Deposit fully processed: ${deposit.txHash}\n`);

          } catch (creditError) {
            console.error(`Error crediting deposit ${deposit.id}:`, creditError);

            // Mark as failed and increment retry count
            await dbService.updateDepositStatus(deposit.id, 'failed', {
              errorMessage: creditError instanceof Error ? creditError.message : 'Unknown error',
              retryCount: deposit.retryCount + 1
            });

            // Alert admin if retry count is high
            if (deposit.retryCount >= 3) {
              console.error(`🚨 ALERT: Deposit ${deposit.id} failed ${deposit.retryCount + 1} times!`);
            }
          }
        }

      } catch (error) {
        console.error(`Error processing pending deposit ${deposit.id}:`, error);
      }
    }

  } catch (error) {
    console.error('❌ Error processing pending deposits:', error);
  }
}

/**
 * Main monitoring loop
 */
async function monitorDeposits() {
  await scanForNewDeposits();
  await processPendingDeposits();
}

// ========== START WORKER ==========

console.log('💰 Starting Deposit Monitor Worker...');
console.log(`📊 Scan interval: ${SCAN_INTERVAL / 1000}s`);
console.log(`✅ Required confirmations: ${CONFIRMATIONS_REQUIRED}\n`);

// Initial check
monitorDeposits();

// Set interval
setInterval(monitorDeposits, SCAN_INTERVAL);
