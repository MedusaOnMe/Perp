import crypto from 'crypto';

/**
 * Generate a master encryption key for AES-256-GCM
 * This should be run once and the key stored securely in environment variables
 */

const masterKey = crypto.randomBytes(32).toString('hex');

console.log('\n🔐 Master Encryption Key Generated\n');
console.log('━'.repeat(80));
console.log('\nYour master encryption key (keep this SECRET):');
console.log('\n' + masterKey + '\n');
console.log('━'.repeat(80));
console.log('\n⚠️  IMPORTANT:');
console.log('1. Add this to your .env file as MASTER_ENCRYPTION_KEY');
console.log('2. Never commit this key to version control');
console.log('3. If you lose this key, all encrypted data is UNRECOVERABLE');
console.log('4. Use a secrets manager (AWS Secrets Manager, etc.) in production');
console.log('\nExample .env entry:');
console.log(`MASTER_ENCRYPTION_KEY=${masterKey}\n`);
