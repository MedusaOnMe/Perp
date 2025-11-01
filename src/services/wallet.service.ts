import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import crypto from 'crypto';
import { encrypt } from './encryption.service';

// Initialize @noble/ed25519 with Node.js crypto
ed.etc.sha512Sync = (...m) => crypto.createHash('sha512').update(Buffer.concat(m.map(b => Buffer.from(b)))).digest();

export interface WalletKeys {
  // EVM Wallet
  walletAddress: string;
  encryptedWalletPrivateKey: string;

  // Orderly Keys (Ed25519)
  orderlyPublicKey: string;
  encryptedOrderlyPrivateKey: string;

  // Trading Keys (Secp256k1)
  orderlyTradingPublicKey: string;
  encryptedTradingPrivateKey: string;
}

export class WalletService {
  /**
   * Generate all necessary keys for a new user
   * @returns Wallet keys (with encrypted private keys)
   */
  async generateUserKeys(): Promise<WalletKeys> {
    // 1. Generate EVM wallet
    const evmWallet = ethers.Wallet.createRandom();
    const walletAddress = evmWallet.address;
    const walletPrivateKey = evmWallet.privateKey;

    // 2. Generate Ed25519 keypair for Orderly authentication
    const orderlyPrivateKeyBytes = ed.utils.randomPrivateKey();
    const orderlyPublicKeyBytes = await ed.getPublicKey(orderlyPrivateKeyBytes);

    const orderlyPrivateKey = Buffer.from(orderlyPrivateKeyBytes).toString('hex');
    const orderlyPublicKey = Buffer.from(orderlyPublicKeyBytes).toString('hex');

    // 3. Generate Secp256k1 keypair for trading signatures
    const tradingWallet = ethers.Wallet.createRandom();
    const tradingPrivateKey = tradingWallet.privateKey;
    const tradingPublicKey = tradingWallet.publicKey;

    // 4. Encrypt all private keys
    const encryptedWalletPrivateKey = encrypt(walletPrivateKey);
    const encryptedOrderlyPrivateKey = encrypt(orderlyPrivateKey);
    const encryptedTradingPrivateKey = encrypt(tradingPrivateKey);

    return {
      walletAddress,
      encryptedWalletPrivateKey,
      orderlyPublicKey,
      encryptedOrderlyPrivateKey,
      orderlyTradingPublicKey: tradingPublicKey,
      encryptedTradingPrivateKey
    };
  }

  /**
   * Sign an EIP-712 message for Orderly account registration
   * @param privateKey - EVM private key (decrypted)
   * @param message - Registration message object
   * @returns Signature
   */
  async signRegistrationMessage(
    privateKey: string,
    message: {
      brokerId: string;
      chainId: number;
      timestamp: number;
      registrationNonce: number;
    }
  ): Promise<string> {
    const wallet = new ethers.Wallet(privateKey);

    // EIP-712 domain (off-chain verification)
    const domain = {
      name: 'Orderly',
      version: '1',
      chainId: message.chainId,
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
    };

    // Message types - per Orderly docs
    const types = {
      Registration: [
        { name: 'brokerId', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'registrationNonce', type: 'uint256' }
      ]
    };

    // Sign the typed data
    const signature = await wallet._signTypedData(domain, types, message);

    return signature;
  }

  /**
   * Sign a message using Ed25519 for Orderly API authentication
   * @param privateKeyHex - Ed25519 private key (hex string, decrypted)
   * @param message - Message to sign
   * @returns Base64 URL-safe signature
   */
  async signOrderlyRequest(privateKeyHex: string, message: string): Promise<string> {
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
    const messageBytes = new TextEncoder().encode(message);

    const signature = await ed.sign(messageBytes, privateKeyBytes);

    // Return base64 URL-safe encoding
    return Buffer.from(signature).toString('base64url');
  }

  /**
   * Sign a trading order using Secp256k1
   * @param tradingPrivateKey - Secp256k1 private key (decrypted)
   * @param orderParams - Normalized order parameters
   * @returns Signature
   */
  async signTradingOrder(
    tradingPrivateKey: string,
    orderParams: Record<string, any>
  ): Promise<string> {
    // Normalize parameters (remove trailing zeros)
    const normalized = this.normalizeOrderParams(orderParams);

    // Create query string (sorted by key)
    const queryString = Object.entries(normalized)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    // Sign with Secp256k1
    const wallet = new ethers.Wallet(tradingPrivateKey);
    const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(queryString));
    const messageBytes = ethers.utils.arrayify(messageHash);

    const signature = await wallet.signMessage(messageBytes);

    return signature;
  }

  /**
   * Normalize order parameters (remove trailing zeros)
   * @param params - Order parameters
   * @returns Normalized parameters
   */
  private normalizeOrderParams(params: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        // Remove trailing zeros: 150.00 -> 150
        normalized[key] = value.toString().replace(/\.?0+$/, '');
      } else {
        normalized[key] = String(value);
      }
    }

    return normalized;
  }

  /**
   * Generate a 6-digit code for wallet export
   * @returns 6-digit string
   */
  generateExportCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Generate a random secret path (UUID) for wallet export
   * @returns UUID string
   */
  generateSecretPath(): string {
    return crypto.randomUUID();
  }
}

// Singleton instance
export const walletService = new WalletService();
