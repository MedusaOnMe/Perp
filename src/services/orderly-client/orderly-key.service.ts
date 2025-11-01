// Orderly Key Management Service
// Manages Ed25519 keypairs for API authentication

import { generateEd25519Keypair } from './orderly-auth';
import { getDb, Collections } from '../../../config/firebase';
import { EncryptionService } from '../encryption.service';

interface StoredOrderlyKey {
  accountId: string;
  publicKeyBase58: string;
  encryptedPrivateKey: string;
  scope: string;
  expirationTimestamp: number;
  createdAt: number;
}

export class OrderlyKeyService {
  private encryptionService: EncryptionService;

  constructor() {
    this.encryptionService = new EncryptionService();
  }

  /**
   * Generate new Ed25519 keypair for an account
   */
  async generateKeyForAccount(
    accountId: string,
    scope: string = 'trading',
    expirationDays: number = 365
  ): Promise<{ publicKeyBase58: string; privateKeyHex: string }> {
    const { privateKeyHex, publicKeyBase58 } = await generateEd25519Keypair();

    const expirationTimestamp = Date.now() + expirationDays * 24 * 60 * 60 * 1000;

    // Encrypt private key before storage
    const encryptedPrivateKey = this.encryptionService.encrypt(privateKeyHex);

    // Store in Firestore
    const db = getDb();
    await db.collection(Collections.USERS).doc(accountId).update({
      orderlyKey: {
        publicKeyBase58,
        encryptedPrivateKey,
        scope,
        expirationTimestamp,
        createdAt: Date.now(),
      },
    });

    return { publicKeyBase58, privateKeyHex };
  }

  /**
   * Get decrypted Orderly key for an account
   */
  async getKeyForAccount(accountId: string): Promise<{
    publicKeyBase58: string;
    privateKeyHex: string;
    scope: string;
    expirationTimestamp: number;
  } | null> {
    const db = getDb();
    const userDoc = await db.collection(Collections.USERS).doc(accountId).get();

    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    const keyData = userData?.orderlyKey as StoredOrderlyKey | undefined;

    if (!keyData) {
      return null;
    }

    // Check if key is expired
    if (Date.now() > keyData.expirationTimestamp) {
      console.warn(`Orderly key expired for account ${accountId}`);
      return null;
    }

    // Decrypt private key
    const privateKeyHex = this.encryptionService.decrypt(keyData.encryptedPrivateKey);

    return {
      publicKeyBase58: keyData.publicKeyBase58,
      privateKeyHex,
      scope: keyData.scope,
      expirationTimestamp: keyData.expirationTimestamp,
    };
  }

  /**
   * Check if account has valid (non-expired) Orderly key
   */
  async hasValidKey(accountId: string): Promise<boolean> {
    const key = await this.getKeyForAccount(accountId);
    return key !== null;
  }

  /**
   * Delete Orderly key for an account
   */
  async deleteKeyForAccount(accountId: string): Promise<void> {
    const db = getDb();
    await db.collection(Collections.USERS).doc(accountId).update({
      orderlyKey: null,
    });
  }

  /**
   * Get expiration status for a key
   */
  async getKeyExpiration(accountId: string): Promise<{
    isExpired: boolean;
    expiresAt: number;
    daysRemaining: number;
  } | null> {
    const key = await this.getKeyForAccount(accountId);

    if (!key) {
      return null;
    }

    const now = Date.now();
    const isExpired = now > key.expirationTimestamp;
    const daysRemaining = Math.max(
      0,
      Math.floor((key.expirationTimestamp - now) / (24 * 60 * 60 * 1000))
    );

    return {
      isExpired,
      expiresAt: key.expirationTimestamp,
      daysRemaining,
    };
  }
}
