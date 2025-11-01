import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { initializeFirebase } from '../config/firebase';
import { dbService } from '../src/services/db.service';
import { encrypt } from '../src/services/encryption.service';
import { Timestamp } from 'firebase-admin/firestore';

// Load environment
dotenv.config();

// Initialize Firebase
initializeFirebase();

/**
 * Setup or display platform wallet for receiving deposits
 */
async function setupPlatformWallet() {
  try {
    console.log('\n🔐 Platform Wallet Setup\n');
    console.log('━'.repeat(80));

    // Check if platform wallet already exists
    const existing = await dbService.getPlatformWallet();

    if (existing) {
      console.log('\n✅ Platform wallet already exists:');
      console.log(`\nAddress: ${existing.address}`);
      console.log(`Network: ${existing.network}`);
      console.log(`Chain ID: ${existing.chainId}`);
      console.log(`Last Scanned Block: ${existing.lastScannedBlock}`);
      console.log(`\n⚠️  To create a new wallet, delete the existing one from Firestore first.\n`);
      return;
    }

    // Check if wallet is provided in env
    const existingPrivateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY;
    let wallet: ethers.Wallet;

    if (existingPrivateKey) {
      console.log('\n📝 Using existing wallet from environment...\n');
      wallet = new ethers.Wallet(existingPrivateKey);
    } else {
      console.log('\n🎲 Generating new random wallet...\n');
      wallet = ethers.Wallet.createRandom();
    }

    const address = wallet.address;
    const privateKey = wallet.privateKey;

    // Encrypt private key
    const encryptedPrivateKey = encrypt(privateKey);

    // Get current block (Arbitrum)
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const currentBlock = await provider.getBlockNumber();

    const chainId = parseInt(process.env.ORDERLY_CHAIN_ID || '42161');
    const network = chainId === 42161 ? 'arbitrum' : 'unknown';

    // Save to Firestore
    const platformWallet = await dbService.createPlatformWallet({
      address,
      privateKey: encryptedPrivateKey,
      chainId,
      network,
      lastScannedBlock: currentBlock,
      createdAt: Timestamp.now()
    });

    console.log('✅ Platform wallet created successfully!\n');
    console.log('━'.repeat(80));
    console.log(`\nAddress: ${address}`);
    console.log(`Network: ${network.toUpperCase()} (Chain ID: ${chainId})`);
    console.log(`Starting Block: ${currentBlock}`);
    console.log(`\n🔑 Private Key (SAVE THIS SECURELY):\n`);
    console.log(privateKey);
    console.log('\n━'.repeat(80));

    console.log('\n⚠️  IMPORTANT:');
    console.log('1. Save the private key in a secure location');
    console.log('2. Add to .env: PLATFORM_WALLET_PRIVATE_KEY=' + privateKey);
    console.log('3. Never commit this key to version control');
    console.log('4. This wallet will receive all user USDC deposits');
    console.log('5. Ensure it has ETH for gas fees when transferring to Orderly');
    console.log('\n💡 Users should send USDC to this address:');
    console.log(`   ${address}`);
    console.log(`   on Arbitrum One network\n`);

    if (!existingPrivateKey) {
      console.log('🚨 NEW WALLET GENERATED - Update your .env file now!\n');
    }

  } catch (error) {
    console.error('❌ Error setting up platform wallet:', error);
    process.exit(1);
  }
}

// Run setup
setupPlatformWallet()
  .then(() => {
    console.log('Done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
