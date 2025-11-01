# Orderly Network - Complete API Integration Guide

**Version:** 1.0
**Date:** 2025-11-01
**Target:** Production-ready integration in < 30 minutes

---

## Table of Contents

1. [Base Configuration](#base-configuration)
2. [Authentication Algorithm](#authentication-algorithm)
3. [Endpoint Catalog](#endpoint-catalog)
4. [Complete Integration Flow](#complete-integration-flow)
5. [Code Examples](#code-examples)
6. [Error Handling](#error-handling)
7. [Troubleshooting](#troubleshooting)

---

## Base Configuration

### API Endpoints

| Environment | Base URL | Usage |
|-------------|----------|-------|
| **Testnet** | `https://testnet-api.orderly.org` | Development & testing |
| **Mainnet** | `https://api.orderly.org` | Production trading |

### Rate Limits

**Global Limit:** 10 requests per second per IP (public endpoints)
**Authenticated Limit:** 10 requests per second per Orderly Key

**Response on Limit Exceeded:**
```json
{
  "success": false,
  "code": -1003,
  "message": "Rate limit exceed"
}
```

**HTTP Status:** 429 Too Many Requests

**Backoff Strategy:**
```typescript
async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  let retries = 0;
  while (retries < 3) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Rate limit exceeded after 3 retries');
}
```

### Request/Response Format

**Content Types:**
- `GET` / `DELETE`: Query string parameters
- `POST` / `PUT`: JSON body with `Content-Type: application/json`

**Standard Response:**
```json
{
  "success": true | false,
  "timestamp": 1699999999999,
  "data": { ... },
  "code": -1000,      // Only on error
  "message": "..."    // Only on error
}
```

---

## Authentication Algorithm

### Overview

Orderly uses **Ed25519 signature-based authentication** for all private endpoints.

**Required Headers:**
```
Content-Type: application/json
orderly-timestamp: 1699999999999
orderly-account-id: 0xabc123...
orderly-key: ed25519:2kxr3Hd7...
orderly-signature: eyJhbGci...
```

### String-to-Sign Construction

**Format:** `[timestamp][METHOD][path][?query][body]`

#### GET/DELETE Requests

```
String-to-sign: <timestamp><METHOD><path><query>

Example:
1699999999999GET/v1/client/holding?all=false
```

#### POST/PUT Requests

```
String-to-sign: <timestamp><METHOD><path><JSON-body>

Example:
1699999999999POST/v1/order{"symbol":"PERP_ETH_USDC","order_type":"LIMIT","side":"BUY","order_price":1800,"order_quantity":0.5}
```

**Critical Rules:**
1. **NO spaces** in the string
2. **NO line breaks** in JSON body (use compact JSON)
3. **Method must be UPPERCASE** (GET, POST, PUT, DELETE)
4. **Path starts with /** (no base URL)
5. **Query string includes ?** (if present)
6. **Body is stringified JSON** (no extra whitespace)

### Signature Generation (Ed25519)

```typescript
import * as ed from '@noble/ed25519';

async function signRequest(
  method: string,
  path: string,
  timestamp: number,
  body: any,
  privateKeyBase58: string
): Promise<string> {
  // 1. Build string to sign
  let stringToSign = `${timestamp}${method.toUpperCase()}${path}`;

  if (body && (method === 'POST' || method === 'PUT')) {
    stringToSign += JSON.stringify(body);  // No spaces!
  }

  // 2. Decode private key from base58
  const privateKeyBytes = base58.decode(privateKeyBase58);

  // 3. Sign the UTF-8 bytes
  const messageBytes = new TextEncoder().encode(stringToSign);
  const signatureBytes = await ed.sign(messageBytes, privateKeyBytes);

  // 4. Encode signature as base64url
  return base64url.encode(Buffer.from(signatureBytes));
}
```

### Timestamp Validation

**Rule:** Server rejects requests if timestamp differs by **> 300 seconds** (5 minutes) from server time.

**Best Practice:**
```typescript
function getValidTimestamp(): number {
  // Use system time - ensure NTP sync
  return Date.now();
}

// Before production: sync server clock with NTP
// sudo apt-get install ntp
// sudo systemctl enable ntp
```

**Clock Skew Handling:**
```typescript
async function makeAuthenticatedRequest(config: RequestConfig) {
  try {
    return await request(config);
  } catch (error) {
    if (error.code === -1002 && error.message.includes('timestamp')) {
      // Server time differs - log warning
      console.warn('Clock skew detected. Sync system clock with NTP.');
      // Optionally: fetch server time from response headers
    }
    throw error;
  }
}
```

---

## Endpoint Catalog

### Public Endpoints (No Auth Required)

#### 1. GET /v1/public/broker/name

**Purpose:** List available builders/brokers

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| broker_id | string | No | Filter by specific broker |

**Response:**
```json
{
  "success": true,
  "timestamp": 1702989203989,
  "data": {
    "rows": [
      {
        "broker_id": "woofi_pro",
        "broker_name": "WOOFi Pro"
      }
    ]
  }
}
```

**Rate Limit:** 10 req/s per IP

**Example:**
```bash
curl "https://testnet-api.orderly.org/v1/public/broker/name?broker_id=woofi_pro"
```

---

#### 2. GET /v1/registration_nonce

**Purpose:** Get nonce for account registration

**Parameters:** None

**Response:**
```json
{
  "success": true,
  "timestamp": 1702989203989,
  "data": {
    "registration_nonce": "194528949540"
  }
}
```

**Nonce Validity:** 2 minutes (one-time use)

**Example:**
```bash
curl "https://testnet-api.orderly.org/v1/registration_nonce"
```

**Important:** Nonce expires after 2 minutes or first use. Generate fresh nonce for each registration.

---

#### 3. POST /v1/register_account

**Purpose:** Register new Orderly account

**Request Body:**
```json
{
  "message": {
    "brokerId": "woofi_pro",
    "chainId": 421614,
    "timestamp": 1699999999999,
    "registrationNonce": 194528949540
  },
  "signature": "0x1234abcd...",
  "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**EIP-712 Type:**
```typescript
const types = {
  Registration: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'registrationNonce', type: 'uint256' }
  ]
};

const domain = {
  name: "Orderly",
  version: "1",
  chainId: 421614,
  verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"
};
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "account_id": "0xabcdef123456789..."
  }
}
```

**Errors:**
- `-1609`: Invalid nonce (expired or already used)
- `-1613`: Signature verification failed
- `-1614`: Broker ID doesn't exist
- `-1007`: Account already registered

**Example (TypeScript):**
```typescript
import { ethers } from 'ethers';

async function registerAccount(
  wallet: ethers.Wallet,
  brokerId: string,
  chainId: number
): Promise<string> {
  // 1. Get nonce
  const nonceRes = await fetch('https://testnet-api.orderly.org/v1/registration_nonce');
  const { data } = await nonceRes.json();
  const nonce = parseInt(data.registration_nonce);

  // 2. Sign EIP-712 message
  const timestamp = Date.now();
  const domain = {
    name: "Orderly",
    version: "1",
    chainId,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"
  };

  const types = {
    Registration: [
      { name: 'brokerId', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'timestamp', type: 'uint64' },
      { name: 'registrationNonce', type: 'uint256' }
    ]
  };

  const message = { brokerId, chainId, timestamp, registrationNonce: nonce };
  const signature = await wallet._signTypedData(domain, types, message);

  // 3. Register
  const res = await fetch('https://testnet-api.orderly.org/v1/register_account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature, userAddress: wallet.address })
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.message);

  return result.data.account_id;
}
```

---

#### 4. GET /v1/get_all_accounts

**Purpose:** Query all accounts for a wallet address

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| address | string | Yes | Wallet address (0x...) |
| broker_id | string | Yes | Builder ID |
| chain_type | string | No | "EVM" or "SOL" |

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "rows": [
      {
        "user_id": 12345,
        "account_id": "0xabcdef...",
        "broker_id": "woofi_pro",
        "chain_type": "EVM",
        "user_type": "MAIN"
      }
    ]
  }
}
```

**Example:**
```bash
curl "https://testnet-api.orderly.org/v1/get_all_accounts?address=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb&broker_id=woofi_pro"
```

---

#### 5. POST /v1/orderly_key

**Purpose:** Add Ed25519 authentication key to account

**Request Body:**
```json
{
  "message": {
    "brokerId": "woofi_pro",
    "chainId": 421614,
    "orderlyKey": "ed25519:2kxr3Hd7ZiHQgxXxN...",
    "scope": "trading",
    "timestamp": 1699999999999,
    "expiration": 1731535999999
  },
  "signature": "0x1234abcd...",
  "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**EIP-712 Type:**
```typescript
const types = {
  AddOrderlyKey: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'orderlyKey', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'expiration', type: 'uint64' }
  ]
};
```

**Scope Values:**
- `read` - Query balances, positions, orders
- `trading` - Includes read + place/cancel orders
- `asset` - Withdrawals (requires separate signature)

**Expiration:** Max 365 days from now

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "orderly_key": "ed25519:2kxr3Hd7ZiHQgxXxN...",
    "scope": "trading",
    "expiration": 1731535999999
  }
}
```

**Example (TypeScript):**
```typescript
import * as ed from '@noble/ed25519';
import * as base58 from 'bs58';

async function addOrderlyKey(
  wallet: ethers.Wallet,
  brokerId: string,
  chainId: number
): Promise<{ publicKey: string, privateKey: string }> {
  // 1. Generate Ed25519 keypair
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKey(privateKey);

  const privateKeyBase58 = base58.encode(Buffer.from(privateKey));
  const publicKeyBase58 = base58.encode(Buffer.from(publicKey));
  const orderlyKey = `ed25519:${publicKeyBase58}`;

  // 2. Sign EIP-712 message
  const timestamp = Date.now();
  const expiration = timestamp + (365 * 24 * 60 * 60 * 1000); // 1 year

  const domain = {
    name: "Orderly",
    version: "1",
    chainId,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"
  };

  const types = {
    AddOrderlyKey: [
      { name: 'brokerId', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'orderlyKey', type: 'string' },
      { name: 'scope', type: 'string' },
      { name: 'timestamp', type: 'uint64' },
      { name: 'expiration', type: 'uint64' }
    ]
  };

  const message = {
    brokerId,
    chainId,
    orderlyKey,
    scope: 'trading',
    timestamp,
    expiration
  };

  const signature = await wallet._signTypedData(domain, types, message);

  // 3. Submit key
  const res = await fetch('https://testnet-api.orderly.org/v1/orderly_key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature, userAddress: wallet.address })
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.message);

  return {
    publicKey: publicKeyBase58,
    privateKey: privateKeyBase58
  };
}
```

---

#### 6. GET /v1/get_orderly_key

**Purpose:** Retrieve registered Orderly key info

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| account_id | string | Yes | Account ID (0x...) |
| orderly_key | string | Yes | Public key with prefix |

**Example:**
```bash
curl "https://testnet-api.orderly.org/v1/get_orderly_key?account_id=0xabc...&orderly_key=ed25519:2kxr3..."
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "orderly_key": "ed25519:2kxr3Hd7ZiHQgxXxN...",
    "scope": "trading",
    "expiration": 1731535999999,
    "tag": ""
  }
}
```

---

### Private Endpoints (Auth Required)

#### 7. GET /v1/client/holding

**Purpose:** Get account balance

**Headers:**
```
Content-Type: application/json
orderly-timestamp: 1699999999999
orderly-account-id: 0xabc123...
orderly-key: ed25519:2kxr3Hd7...
orderly-signature: eyJhbGci...
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| all | boolean | No | Include zero balances |

**String-to-Sign:**
```
1699999999999GET/v1/client/holding?all=false
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "holding": [
      {
        "token": "USDC",
        "holding": 1000.5,
        "frozen": 50.0,
        "pending_short": 0,
        "updated_time": 1699999999999
      }
    ]
  }
}
```

---

#### 8. GET /v1/positions

**Purpose:** Get open positions

**Headers:** Same as above

**String-to-Sign:**
```
1699999999999GET/v1/positions
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "rows": [
      {
        "symbol": "PERP_ETH_USDC",
        "position_qty": 0.5,
        "cost_position": 900.0,
        "last_sum_unitary_funding": 0.001,
        "pending_long_qty": 0,
        "pending_short_qty": 0,
        "settle_price": 1800.0,
        "average_open_price": 1800.0,
        "unsettled_pnl": 50.0,
        "mark_price": 1850.0,
        "unrealized_pnl": 25.0
      }
    ]
  }
}
```

---

#### 9. POST /v1/order

**Purpose:** Create new order

**Headers:** Same as above

**Request Body:**
```json
{
  "symbol": "PERP_ETH_USDC",
  "order_type": "LIMIT",
  "side": "BUY",
  "order_price": 1800.5,
  "order_quantity": 0.5,
  "client_order_id": "my-order-123"
}
```

**String-to-Sign:**
```
1699999999999POST/v1/order{"symbol":"PERP_ETH_USDC","order_type":"LIMIT","side":"BUY","order_price":1800.5,"order_quantity":0.5,"client_order_id":"my-order-123"}
```

**Order Types:**
- `LIMIT` - Standard limit order
- `MARKET` - Market order (no price required)
- `IOC` - Immediate-or-cancel
- `FOK` - Fill-or-kill
- `POST_ONLY` - Maker-only order
- `ASK` - Best ask price
- `BID` - Best bid price

**Required Fields by Type:**

| Type | Price | Quantity | Amount | Notes |
|------|-------|----------|--------|-------|
| LIMIT | ✅ | ✅ | ❌ | Standard |
| MARKET | ❌ | BUY: ❌ / SELL: ✅ | BUY: ✅ / SELL: ❌ | Buy by amount, sell by qty |
| IOC | ✅ | ✅ | ❌ | Partial fills allowed |
| FOK | ✅ | ✅ | ❌ | All-or-nothing |
| POST_ONLY | ✅ | ✅ | ❌ | Rejects if taker |
| ASK/BID | ❌ | ✅ | ❌ | Best price guaranteed |

**Optional Fields:**
```json
{
  "visible_quantity": 0.2,      // Iceberg order (0 = fully hidden)
  "reduce_only": true,          // Only reduce position
  "order_tag": "strategy-1",    // Custom tag
  "post_only_adjust": true,     // Auto-adjust price to avoid taker
  "slippage": 0.01              // MARKET orders only (1% max slippage)
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699999999999,
  "data": {
    "order_id": 123456789,
    "client_order_id": "my-order-123",
    "order_type": "LIMIT",
    "order_price": 1800.5,
    "order_quantity": 0.5,
    "order_amount": null
  }
}
```

**Errors:**
- `-1101`: Risk too high (insufficient margin)
- `-1102`: Min notional not met
- `-1103`: Price filter violation
- `-1104`: Size filter violation
- `-1105`: Percentage filter (price too far from mid)

---

## Complete Integration Flow

### Phase 1: Account Setup (One-Time)

```typescript
import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import * as base58 from 'bs58';

const BROKER_ID = 'woofi_pro';
const CHAIN_ID = 421614; // Arbitrum Sepolia
const API_BASE = 'https://testnet-api.orderly.org';

async function setupAccount(walletPrivateKey: string) {
  const wallet = new ethers.Wallet(walletPrivateKey);

  // Step 1: Register account
  console.log('Step 1/3: Registering account...');
  const accountId = await registerAccount(wallet, BROKER_ID, CHAIN_ID);
  console.log(`✅ Account ID: ${accountId}`);

  // Step 2: Add Orderly key
  console.log('Step 2/3: Generating Orderly key...');
  const { publicKey, privateKey } = await addOrderlyKey(wallet, BROKER_ID, CHAIN_ID);
  console.log(`✅ Public Key: ed25519:${publicKey}`);
  console.log(`⚠️  SAVE PRIVATE KEY: ${privateKey}`);

  // Step 3: Store credentials (encrypted!)
  await storeCredentials({
    accountId,
    orderlyPublicKey: publicKey,
    orderlyPrivateKey: privateKey,  // ENCRYPT THIS!
    walletAddress: wallet.address
  });

  console.log('✅ Account setup complete!');

  return { accountId, orderlyPublicKey: publicKey, orderlyPrivateKey: privateKey };
}
```

### Phase 2: Deposit Funds

```typescript
import { ethers } from 'ethers';
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';

async function depositFunds(
  walletPrivateKey: string,
  accountId: string,
  amount: number
) {
  const wallet = new ethers.Wallet(walletPrivateKey, provider);

  // Contract addresses (Arbitrum Sepolia)
  const VAULT = '0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f';
  const USDC = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';

  // 1. Approve USDC
  const usdc = new ethers.Contract(USDC, ['function approve(address,uint256)'], wallet);
  const amountWei = ethers.utils.parseUnits(amount.toString(), 6); // USDC = 6 decimals

  console.log('Approving USDC...');
  const approveTx = await usdc.approve(VAULT, amountWei);
  await approveTx.wait();

  // 2. Calculate hashes
  const brokerHash = keccak256(toUtf8Bytes(BROKER_ID));
  const tokenHash = keccak256(toUtf8Bytes('USDC'));

  // 3. Deposit
  const vault = new ethers.Contract(VAULT, [
    'function deposit(bytes32 accountId, bytes32 brokerHash, bytes32 tokenHash, uint128 tokenAmount)'
  ], wallet);

  console.log('Depositing to Orderly...');
  const depositTx = await vault.deposit(accountId, brokerHash, tokenHash, amountWei);
  await depositTx.wait();

  console.log('✅ Deposit submitted. Waiting for settlement (~30 sec)...');

  // 4. Wait for balance to update
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('✅ Deposit complete!');
}
```

### Phase 3: Place Order

```typescript
async function placeOrder(
  accountId: string,
  orderlyPublicKey: string,
  orderlyPrivateKey: string,
  orderParams: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    price?: number;
    quantity?: number;
  }
) {
  const timestamp = Date.now();
  const path = '/v1/order';

  // 1. Build order body
  const body: any = {
    symbol: orderParams.symbol,
    order_type: orderParams.orderType,
    side: orderParams.side
  };

  if (orderParams.price) body.order_price = orderParams.price;
  if (orderParams.quantity) body.order_quantity = orderParams.quantity;

  // 2. Generate signature
  const stringToSign = `${timestamp}POST${path}${JSON.stringify(body)}`;
  const messageBytes = new TextEncoder().encode(stringToSign);
  const privateKeyBytes = base58.decode(orderlyPrivateKey);
  const signatureBytes = await ed.sign(messageBytes, privateKeyBytes);
  const signature = base64url.encode(Buffer.from(signatureBytes));

  // 3. Make request
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'orderly-timestamp': timestamp.toString(),
      'orderly-account-id': accountId,
      'orderly-key': `ed25519:${orderlyPublicKey}`,
      'orderly-signature': signature
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(`Order failed: ${result.message} (code: ${result.code})`);
  }

  console.log(`✅ Order placed! ID: ${result.data.order_id}`);
  return result.data;
}
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "code": -1101,
  "message": "The risk exposure for client is too high",
  "timestamp": 1699999999999
}
```

### Common Errors

| Code | Name | Cause | Fix |
|------|------|-------|-----|
| -1000 | UNKNOWN | Server error or data not found | Retry after delay; contact support if persists |
| -1001 | INVALID_SIGNATURE | API key format wrong | Verify key encoding (base58 for Ed25519) |
| -1002 | UNAUTHORIZED | Invalid/expired/revoked key | Check key expiration; re-register if needed |
| -1003 | TOO_MANY_REQUEST | Rate limit exceeded | Implement exponential backoff |
| -1004 | UNKNOWN_PARAM | Invalid parameter sent | Remove unknown params |
| -1005 | INVALID_PARAM | Wrong parameter format | Validate types/ranges |
| -1006 | RESOURCE_NOT_FOUND | Resource doesn't exist | Check resource exists before operations |
| -1007 | DUPLICATE_REQUEST | Already exists | Check for duplicates before retry |
| -1101 | RISK_TOO_HIGH | Insufficient margin | Reduce size or deposit more collateral |
| -1102 | MIN_NOTIONAL | Order value too small | Increase order value |
| -1103 | PRICE_FILTER | Price out of range | Adjust price to symbol's range |
| -1104 | SIZE_FILTER | Quantity doesn't match step | Round to step size |
| -1105 | PERCENTAGE_FILTER | Price too far from mid | Move price closer to market |
| -1609 | INVALID_NONCE | Nonce expired/used | Get fresh nonce |
| -1613 | SIGNATURE_MISMATCH | EIP-712 signature invalid | Verify message structure |
| -1614 | BROKER_NOT_EXIST | Invalid broker ID | Use valid broker from list |

### Error Handler Implementation

```typescript
class OrderlyError extends Error {
  constructor(
    public code: number,
    message: string,
    public retryable: boolean = false
  ) {
    super(message);
  }
}

function handleOrderlyError(response: any): never {
  const { code, message } = response;

  // Retryable errors
  const retryable = [-1000, -1003, -1011].includes(code);

  // Map error codes to user-friendly messages
  const errorMap: Record<number, string> = {
    '-1101': 'Insufficient margin. Deposit more funds or reduce position size.',
    '-1102': 'Order value too small. Minimum order value is $10.',
    '-1103': 'Order price out of range for this symbol.',
    '-1104': 'Order quantity must match symbol step size.',
    '-1105': 'Order price too far from current market price.',
    '-1609': 'Registration nonce expired. Please try again.',
    '-1613': 'Signature verification failed. Check wallet connection.',
    '-1614': 'Invalid broker ID. Contact support.'
  };

  const friendlyMessage = errorMap[code] || message;

  throw new OrderlyError(code, friendlyMessage, retryable);
}

async function callOrderlyAPI<T>(fn: () => Promise<T>): Promise<T> {
  let retries = 0;

  while (retries < 3) {
    try {
      const response = await fn();

      if (!response.success) {
        handleOrderlyError(response);
      }

      return response.data;

    } catch (error) {
      if (error instanceof OrderlyError && error.retryable && retries < 2) {
        const delay = Math.pow(2, retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
}
```

---

## Troubleshooting

### Issue: "brokerId is not exist" (-1614)

**Symptoms:** Registration fails immediately

**Causes:**
1. Using invalid broker ID (e.g., `woofi_dex` instead of `woofi_pro`)
2. Typo in broker ID
3. Using mainnet broker on testnet

**Diagnosis:**
```bash
# List valid brokers
curl "https://testnet-api.orderly.org/v1/public/broker/name"
```

**Fix:**
```env
# Use valid broker from API response
ORDERLY_BROKER_ID=woofi_pro
```

---

### Issue: "address and signature do not match" (-1613)

**Symptoms:** Registration or key addition fails after nonce step

**Causes:**
1. Including `chainType` field in message (not in spec)
2. Wrong EIP-712 domain parameters
3. Incorrect type definitions
4. Using wrong wallet to sign

**Diagnosis:**
```typescript
// Verify message structure matches spec EXACTLY
console.log('Message:', JSON.stringify(message, null, 2));
console.log('Types:', JSON.stringify(types, null, 2));
console.log('Domain:', JSON.stringify(domain, null, 2));
```

**Fix:**
```typescript
// Registration message must have EXACTLY these 4 fields:
const message = {
  brokerId: 'woofi_pro',
  chainId: 421614,
  timestamp: Date.now(),
  registrationNonce: nonce  // Number, not string
};

// NO chainType field!
```

---

### Issue: Clock Skew / Timestamp Errors

**Symptoms:** All authenticated requests fail with -1002

**Causes:**
1. System clock out of sync
2. Incorrect timezone
3. Using cached timestamp

**Diagnosis:**
```bash
# Check system time
date
# Check NTP sync status
timedatectl status
```

**Fix:**
```bash
# Install NTP
sudo apt-get install ntp
sudo systemctl enable ntp
sudo systemctl start ntp

# Force sync
sudo ntpdate -s time.nist.gov
```

---

### Issue: Signature Validation Fails (Authenticated Endpoints)

**Symptoms:** Private endpoints return -1002 or -1001

**Causes:**
1. Wrong encoding (hex instead of base64url)
2. Extra whitespace in JSON body
3. Wrong string-to-sign construction
4. Using wrong private key

**Diagnosis:**
```typescript
// Log string-to-sign
console.log('String to sign:', stringToSign);
console.log('String bytes:', new TextEncoder().encode(stringToSign));

// Verify no extra spaces
if (stringToSign.includes('  ')) {
  console.error('❌ Extra spaces detected!');
}

// Verify JSON is compact
const body = { symbol: 'PERP_ETH_USDC', side: 'BUY' };
console.log('Body:', JSON.stringify(body)); // No spaces!
```

**Fix:**
```typescript
// Ensure compact JSON (no spaces)
const bodyString = JSON.stringify(body);  // Not JSON.stringify(body, null, 2)

// Build string correctly
const stringToSign = `${timestamp}${method.toUpperCase()}${path}${bodyString}`;

// Use base64url encoding (not hex!)
import * as base64url from 'base64url';
const signature = base64url.encode(Buffer.from(signatureBytes));
```

---

**End of Integration Guide**

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│ Orderly API Quick Reference                                 │
├─────────────────────────────────────────────────────────────┤
│ Testnet Base: https://testnet-api.orderly.org              │
│ Mainnet Base: https://api.orderly.org                       │
├─────────────────────────────────────────────────────────────┤
│ PUBLIC ENDPOINTS (No Auth)                                  │
├─────────────────────────────────────────────────────────────┤
│ GET  /v1/public/broker/name       List brokers             │
│ GET  /v1/registration_nonce       Get nonce (2 min TTL)    │
│ POST /v1/register_account         Create account           │
│ POST /v1/orderly_key              Add Ed25519 key          │
│ GET  /v1/get_all_accounts         Query accounts           │
├─────────────────────────────────────────────────────────────┤
│ PRIVATE ENDPOINTS (Auth Required)                           │
├─────────────────────────────────────────────────────────────┤
│ GET  /v1/client/holding           Get balances             │
│ GET  /v1/positions                Get positions            │
│ POST /v1/order                    Place order              │
│ DELETE /v1/order                  Cancel order             │
├─────────────────────────────────────────────────────────────┤
│ AUTH HEADERS                                                │
├─────────────────────────────────────────────────────────────┤
│ Content-Type: application/json                              │
│ orderly-timestamp: <ms>                                     │
│ orderly-account-id: <0x...>                                 │
│ orderly-key: ed25519:<base58>                               │
│ orderly-signature: <base64url>                              │
├─────────────────────────────────────────────────────────────┤
│ STRING TO SIGN                                              │
├─────────────────────────────────────────────────────────────┤
│ GET:  {ts}{METHOD}{path}?{query}                            │
│ POST: {ts}{METHOD}{path}{compact-json}                      │
├─────────────────────────────────────────────────────────────┤
│ SIGNATURE                                                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Encode string as UTF-8                                   │
│ 2. Sign with Ed25519 private key                            │
│ 3. Encode signature as base64url                            │
├─────────────────────────────────────────────────────────────┤
│ COMMON ERRORS                                               │
├─────────────────────────────────────────────────────────────┤
│ -1002  Unauthorized (bad sig/timestamp)                     │
│ -1003  Rate limit (10 req/s)                                │
│ -1101  Insufficient margin                                  │
│ -1609  Nonce expired                                        │
│ -1613  Signature mismatch                                   │
│ -1614  Invalid broker ID                                    │
└─────────────────────────────────────────────────────────────┘
```
