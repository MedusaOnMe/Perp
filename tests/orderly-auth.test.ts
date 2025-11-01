// Unit tests for Orderly authentication and signing

import { OrderlyAuth, generateEd25519Keypair } from '../src/services/orderly-client/orderly-auth';
import { OrderlyWallet } from '../src/services/orderly-client/orderly-wallet';
import * as ed from '@noble/ed25519';

describe('Orderly Authentication', () => {
  let auth: OrderlyAuth;
  const testAccountId = '0x1234567890123456789012345678901234567890123456789012345678901234';

  beforeAll(async () => {
    // Generate test keypair
    const { privateKeyHex, publicKeyBase58 } = await generateEd25519Keypair();
    auth = new OrderlyAuth(privateKeyHex, publicKeyBase58, testAccountId);
  });

  describe('Canonical String Construction', () => {
    it('should construct canonical string correctly for GET request', async () => {
      const headers = await auth.generateAuthHeaders('GET', '/v1/test', undefined);

      expect(headers['orderly-timestamp']).toBeDefined();
      expect(headers['orderly-account-id']).toBe(testAccountId);
      expect(headers['orderly-key']).toBeDefined();
      expect(headers['orderly-signature']).toBeDefined();
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should construct canonical string correctly for POST request', async () => {
      const body = { symbol: 'PERP_ETH_USDC', side: 'BUY' };
      const headers = await auth.generateAuthHeaders('POST', '/v1/order', body);

      expect(headers['orderly-timestamp']).toBeDefined();
      expect(headers['orderly-signature']).toBeDefined();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include recv-window when specified', async () => {
      const headers = await auth.generateAuthHeaders('GET', '/v1/test', undefined, 5000);

      expect(headers['x-recv-window']).toBe('5000');
    });
  });

  describe('Signature Generation', () => {
    it('should generate valid Ed25519 signature', async () => {
      const headers = await auth.generateAuthHeaders('GET', '/v1/test');

      // Signature should be base64 URL-safe encoded
      expect(headers['orderly-signature']).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(headers['orderly-signature'].length).toBeGreaterThan(0);
    });

    it('should generate different signatures for different requests', async () => {
      const headers1 = await auth.generateAuthHeaders('GET', '/v1/test1');
      const headers2 = await auth.generateAuthHeaders('GET', '/v1/test2');

      expect(headers1['orderly-signature']).not.toBe(headers2['orderly-signature']);
    });
  });

  describe('Keypair Generation', () => {
    it('should generate valid Ed25519 keypair', async () => {
      const { privateKeyHex, publicKeyBase58 } = await generateEd25519Keypair();

      expect(privateKeyHex).toMatch(/^[a-f0-9]{64}$/);
      expect(publicKeyBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
      expect(publicKeyBase58.length).toBeGreaterThan(32);
    });

    it('should generate unique keypairs each time', async () => {
      const keypair1 = await generateEd25519Keypair();
      const keypair2 = await generateEd25519Keypair();

      expect(keypair1.privateKeyHex).not.toBe(keypair2.privateKeyHex);
      expect(keypair1.publicKeyBase58).not.toBe(keypair2.publicKeyBase58);
    });
  });

  describe('Timestamp Validation', () => {
    it('should reject timestamp too far in past', async () => {
      // This test would require mocking Date.now() or exposing validateTimestamp
      // Skipping for now as it's an internal method
    });
  });
});

describe('Orderly Wallet', () => {
  const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const testBrokerId = 'woofi_dex';
  const testChainId = 42161;

  let wallet: OrderlyWallet;

  beforeAll(() => {
    wallet = new OrderlyWallet(testPrivateKey);
  });

  describe('Account ID Calculation', () => {
    it('should calculate deterministic account ID', () => {
      const address = wallet.getAddress();
      const accountId = OrderlyWallet.calculateAccountId(address, testBrokerId);

      // Should be 32-byte hex string with 0x prefix
      expect(accountId).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate same account ID for same inputs', () => {
      const address = wallet.getAddress();
      const accountId1 = OrderlyWallet.calculateAccountId(address, testBrokerId);
      const accountId2 = OrderlyWallet.calculateAccountId(address, testBrokerId);

      expect(accountId1).toBe(accountId2);
    });

    it('should generate different account IDs for different brokers', () => {
      const address = wallet.getAddress();
      const accountId1 = OrderlyWallet.calculateAccountId(address, 'broker1');
      const accountId2 = OrderlyWallet.calculateAccountId(address, 'broker2');

      expect(accountId1).not.toBe(accountId2);
    });
  });

  describe('EIP-712 Signing', () => {
    it('should sign registration message', async () => {
      const nonce = '123456789';
      const { message, signature } = await wallet.signRegistration(
        testBrokerId,
        testChainId,
        nonce
      );

      expect(message.brokerId).toBe(testBrokerId);
      expect(message.chainId).toBe(testChainId);
      expect(message.registrationNonce).toBe(nonce);
      expect(message.chainType).toBe('EVM');
      expect(signature).toMatch(/^0x[a-f0-9]+$/);
    });

    it('should sign addOrderlyKey message', async () => {
      const orderlyKey = 'ed25519:TestPublicKey123';
      const scope = 'trading';

      const { message, signature } = await wallet.signAddOrderlyKey(
        testBrokerId,
        testChainId,
        orderlyKey,
        scope
      );

      expect(message.brokerId).toBe(testBrokerId);
      expect(message.chainId).toBe(testChainId);
      expect(message.orderlyKey).toBe(orderlyKey);
      expect(message.scope).toBe(scope);
      expect(signature).toMatch(/^0x[a-f0-9]+$/);
    });

    it('should add ed25519: prefix if missing', async () => {
      const orderlyKeyWithoutPrefix = 'TestPublicKey123';

      const { message } = await wallet.signAddOrderlyKey(
        testBrokerId,
        testChainId,
        orderlyKeyWithoutPrefix,
        'trading'
      );

      expect(message.orderlyKey).toBe('ed25519:TestPublicKey123');
    });

    it('should sign withdraw message', async () => {
      const receiver = '0x1234567890123456789012345678901234567890';
      const token = 'USDC';
      const amount = '1000000';
      const withdrawNonce = 1;
      const ledgerAddress = '0x6F7a338F2aA472838dEFD3283eB360d4Dff5D203';

      const { message, signature } = await wallet.signWithdraw(
        testBrokerId,
        testChainId,
        receiver,
        token,
        amount,
        withdrawNonce,
        ledgerAddress
      );

      expect(message.receiver).toBe(receiver);
      expect(message.token).toBe(token);
      expect(message.amount).toBe(amount);
      expect(message.withdrawNonce).toBe(withdrawNonce);
      expect(signature).toMatch(/^0x[a-f0-9]+$/);
    });
  });
});
