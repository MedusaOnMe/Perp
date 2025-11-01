// Orderly Network Authentication & Signing
// Based on: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication

import * as ed from '@noble/ed25519';
import { OrderlyAuthHeaders, SignaturePayload } from './orderly-types';

// Timestamp validation window: ±300 seconds
const TIMESTAMP_WINDOW_MS = 300 * 1000;

export class OrderlyAuth {
  private privateKey: Uint8Array;
  private publicKey: string; // Base58 encoded
  private accountId: string;

  constructor(privateKeyHex: string, publicKeyBase58: string, accountId: string) {
    this.privateKey = hexToBytes(privateKeyHex);
    this.publicKey = publicKeyBase58;
    this.accountId = accountId;
  }

  /**
   * Construct canonical string for signing
   * Format: <timestamp><method><path><body>
   */
  private constructCanonicalString(payload: SignaturePayload): string {
    const { timestamp, method, path, body } = payload;

    // No delimiters between components
    const canonical = `${timestamp}${method}${path}${body || ''}`;

    return canonical;
  }

  /**
   * Sign message with Ed25519 private key
   * Returns base64 URL-safe encoded signature
   */
  private async signMessage(message: string): Promise<string> {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await ed.signAsync(messageBytes, this.privateKey);

    // Convert to base64 URL-safe format
    const base64 = Buffer.from(signatureBytes).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Generate authentication headers for API requests
   */
  async generateAuthHeaders(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    recvWindow?: number
  ): Promise<OrderlyAuthHeaders> {
    const timestamp = Date.now();

    // Validate timestamp isn't too skewed
    this.validateTimestamp(timestamp);

    // Construct request body string (JSON for POST/PUT)
    const bodyString = body ? JSON.stringify(body) : undefined;

    // Build canonical string
    const canonical = this.constructCanonicalString({
      timestamp,
      method,
      path,
      body: bodyString,
    });

    // Sign canonical string
    const signature = await this.signMessage(canonical);

    // Content-Type based on method
    const contentType =
      method === 'GET' || method === 'DELETE'
        ? 'application/x-www-form-urlencoded'
        : 'application/json';

    const headers: OrderlyAuthHeaders = {
      'Content-Type': contentType,
      'orderly-timestamp': timestamp.toString(),
      'orderly-account-id': this.accountId,
      'orderly-key': this.publicKey,
      'orderly-signature': signature,
    };

    if (recvWindow) {
      headers['x-recv-window'] = recvWindow.toString();
    }

    return headers;
  }

  /**
   * Validate timestamp is within acceptable window
   * Throws if too skewed (±300 seconds)
   */
  private validateTimestamp(timestamp: number): void {
    const now = Date.now();
    const diff = Math.abs(now - timestamp);

    if (diff > TIMESTAMP_WINDOW_MS) {
      throw new Error(
        `Timestamp skew too large: ${diff}ms (max ${TIMESTAMP_WINDOW_MS}ms). ` +
        `Local time may be incorrect.`
      );
    }
  }

  /**
   * Get current account ID
   */
  getAccountId(): string {
    return this.accountId;
  }

  /**
   * Get public key (Base58 encoded)
   */
  getPublicKey(): string {
    return this.publicKey;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleanHex.length / 2);

  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }

  return bytes;
}

/**
 * Generate new Ed25519 keypair
 * Returns { privateKey (hex), publicKey (base58) }
 */
export async function generateEd25519Keypair(): Promise<{
  privateKeyHex: string;
  publicKeyBase58: string;
}> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  const privateKeyHex = Buffer.from(privateKey).toString('hex');
  const publicKeyBase58 = base58Encode(publicKey);

  return {
    privateKeyHex,
    publicKeyBase58,
  };
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let result = '';

  while (num > 0n) {
    const remainder = Number(num % 58n);
    result = ALPHABET[remainder] + result;
    num = num / 58n;
  }

  // Handle leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = ALPHABET[0] + result;
  }

  return result;
}
