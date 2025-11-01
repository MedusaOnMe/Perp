import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
}

export class EncryptionService {
  private masterKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor() {
    const masterKeyHex = process.env.MASTER_ENCRYPTION_KEY;

    if (!masterKeyHex) {
      throw new Error('MASTER_ENCRYPTION_KEY environment variable not set');
    }

    // Ensure the key is 32 bytes (256 bits)
    if (masterKeyHex.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }

    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * @param plaintext - The text to encrypt
   * @returns Encrypted data as JSON string
   */
  encrypt(plaintext: string): string {
    try {
      // Generate a random 12-byte IV (recommended for GCM)
      const iv = crypto.randomBytes(12);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv) as crypto.CipherGCM;

      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Return all components as a JSON string
      const encryptedData: EncryptedData = {
        iv: iv.toString('base64'),
        encrypted,
        tag: tag.toString('base64')
      };

      return JSON.stringify(encryptedData);

    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   * @param ciphertext - The encrypted data as JSON string
   * @returns Decrypted plaintext
   */
  decrypt(ciphertext: string): string {
    try {
      // Parse the encrypted data
      const encryptedData: EncryptedData = JSON.parse(ciphertext);

      // Convert base64 strings back to buffers
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = Buffer.from(encryptedData.tag, 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv) as crypto.DecipherGCM;

      // Set the authentication tag
      decipher.setAuthTag(tag);

      // Decrypt the data
      let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a random encryption key (for initialization)
   * @returns 32-byte hex string
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();

// Helper functions for convenience
export function encrypt(plaintext: string): string {
  return encryptionService.encrypt(plaintext);
}

export function decrypt(ciphertext: string): string {
  return encryptionService.decrypt(ciphertext);
}
