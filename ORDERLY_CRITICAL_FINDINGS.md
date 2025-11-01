# Orderly Network Integration - Critical Findings & Executive Overview

**Generated:** 2025-11-01
**Status:** ULTRA-THINK Mode Analysis Complete
**Documentation Reviewed:** 17 pages from orderly.network/docs

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Critical Issues in Current Implementation](#critical-issues-in-current-implementation)
4. [Core Concepts](#core-concepts)
5. [Supported Chains & Addresses](#supported-chains--addresses)
6. [Quick Start Path](#quick-start-path)

---

## Executive Summary

### What is Orderly Network?

Orderly Network is a **DeFi infrastructure platform** providing:
- **Omnichain perpetual futures trading** via Central Limit Order Book (CLOB)
- **Shared liquidity** across 15+ EVM chains + Solana
- **White-label DEX solution** for builders (no frontend provided)
- **Low-latency orderbook** with on-chain settlement

**Key Value Proposition:** Users on Polygon can trade against users on Arbitrum/Avalanche/Base without bridging assets. Simply connect wallet → trade.

---

## Architecture Overview

Orderly uses a **3-layer architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                    ASSET LAYER                              │
│  (Distributed across all supported chains)                  │
│                                                              │
│  User Operations:                                           │
│  • Account Registration (EIP-712 signature)                 │
│  • Deposits (via Vault smart contracts)                     │
│  • Withdrawals (via Vault + settlement)                     │
│                                                              │
│  Smart Contracts per Chain:                                 │
│  • Vault (holds USDC/USDT)                                  │
│  • VaultCrossChainManager                                   │
│  • CrossChainRelay                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                 SETTLEMENT LAYER                            │
│  (Single chain: Orderly L2, Chain ID 291)                   │
│                                                              │
│  • Transaction ledger (no direct user interaction)          │
│  • PnL settlement                                           │
│  • Cross-chain balance reconciliation                       │
│                                                              │
│  Smart Contracts:                                           │
│  • Ledger (0x6F7a338F2aA472838dEFD3283eB360d4Dff5D203)     │
│  • VaultManager                                             │
│  • LedgerCrossChainManager                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                     ENGINE LAYER                            │
│  (Centralized orderbook - off-chain)                        │
│                                                              │
│  • Order matching engine                                    │
│  • Market data feeds                                        │
│  • REST API + WebSocket                                     │
│  • Authenticated with Ed25519 keys                          │
└─────────────────────────────────────────────────────────────┘
```

### Trust Model

- **Asset Custody:** User funds locked in on-chain Vault contracts (non-custodial)
- **Order Execution:** Off-chain matching engine (centralized for speed)
- **Settlement:** On-chain via Orderly L2 (decentralized settlement)
- **Cross-chain:** LayerZero protocol for cross-chain messaging

---

## Critical Issues in Current Implementation

### 🚨 Issue #1: Invalid Broker ID

**Location:** [.env:14](.env#L14)

```env
# WRONG - This broker doesn't exist
ORDERLY_BROKER_ID=woofi_dex
```

**Root Cause:** The broker `woofi_dex` is **not registered** in Orderly's system.

**Evidence from API:**
```bash
curl https://testnet-api.orderly.org/v1/public/broker/name
# Returns: woofi_pro, orderly, etc. (NOT woofi_dex)
```

**Fix Required:** Use `woofi_pro` (verified to exist on testnet)

**Impact:** All registration attempts fail with error `-1614: brokerId is not exist`

---

### 🚨 Issue #2: Incorrect EIP-712 Message Structure

**Location:** [src/services/orderly.service.ts:48-53](src/services/orderly.service.ts#L48-L53)

**Current Code (WRONG):**
```typescript
const message = {
  brokerId: this.brokerId,
  chainId: this.chainId,
  timestamp,
  registrationNonce,
  chainType: 'EVM'  // ❌ THIS FIELD DOES NOT EXIST IN ORDERLY SPEC
};
```

**Correct Structure per Orderly Docs:**
```typescript
const message = {
  brokerId: this.brokerId,      // string
  chainId: this.chainId,         // uint256
  timestamp: timestamp,          // uint64
  registrationNonce: nonce       // uint256
  // NO chainType field!
};
```

**Source:** [Orderly Docs - Account Registration](https://orderly.network/docs/build-on-omnichain/user-flows/accounts)

**Impact:** Signature validation fails with error `-1613: address and signature do not match`

---

### 🚨 Issue #3: Missing Ed25519 Orderly Key Management

**Status:** NOT IMPLEMENTED

**Required for:** All authenticated API calls (balance, positions, orders)

**What's Missing:**
1. Ed25519 keypair generation
2. AddOrderlyKey EIP-712 signature
3. Key registration via `/v1/orderly_key`
4. Key storage (encrypted) in database
5. Request signing with Ed25519 private key

**Impact:** Cannot place orders or access private endpoints

---

### 🚨 Issue #4: Incorrect Authentication Headers

**Location:** [src/services/orderly.service.ts:121-128](src/services/orderly.service.ts#L121-L128)

**Current Code (INCOMPLETE):**
```typescript
headers: {
  'orderly-account-id': params.accountId,
  'orderly-key': await this.getPublicKeyFromPrivate(orderlyPrivateKey),
  'orderly-signature': authSignature,
  'orderly-timestamp': timestamp.toString()
}
```

**Issues:**
- ❌ `orderly-key` should be **base58-encoded** public key (not hex)
- ❌ `orderly-signature` must be **base64url-encoded** (not hex)
- ❌ Missing `Content-Type: application/json`

**Correct Format:**
```typescript
headers: {
  'Content-Type': 'application/json',
  'orderly-timestamp': timestamp.toString(),
  'orderly-account-id': accountId,
  'orderly-key': 'ed25519:' + base58Encode(publicKey),  // Note: prefix!
  'orderly-signature': base64UrlEncode(signature)
}
```

---

### 🚨 Issue #5: Environment Configuration Mismatch

**Location:** [.env](. env)

**Problems:**
```env
# Testnet config but using mainnet-style settings
ORDERLY_API_URL=https://testnet-api-evm.orderly.org
ORDERLY_BROKER_ID=woofi_dex              # ❌ Doesn't exist
ORDERLY_CHAIN_ID=421614                  # ✅ Correct (Arbitrum Sepolia)

# Missing critical config
# ORDERLY_VERIFYING_CONTRACT=0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC
```

**Correct Testnet Config:**
```env
ORDERLY_API_URL=https://testnet-api.orderly.org
ORDERLY_BROKER_ID=woofi_pro
ORDERLY_CHAIN_ID=421614
ORDERLY_VERIFYING_CONTRACT=0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC
```

---

## Core Concepts

### 1. Account ID

**Definition:** Unique identifier for a user's trading account with a specific builder.

**Calculation:**
```typescript
import { solidityPackedKeccak256 } from 'ethers';

function getAccountId(userAddress: string, brokerId: string): string {
  return solidityPackedKeccak256(
    ['address', 'bytes32'],
    [userAddress, keccak256(toUtf8Bytes(brokerId))]
  );
}
```

**Example:**
- User: `0x1234...`
- Broker: `woofi_pro`
- Account ID: `0xabc123...` (32-byte hex)

**Key Properties:**
- One account per (wallet + builder) pair
- Same wallet can have multiple accounts with different builders
- Account ID used in all authenticated requests

---

### 2. Orderly Key (Ed25519)

**Definition:** Ed25519 keypair for authenticating API requests.

**Purpose:** Separate from wallet private key for security:
- Wallet key: Signs on-chain transactions (registration, deposits, withdrawals)
- Orderly key: Signs API requests (orders, queries)

**Lifecycle:**
1. **Generate:** Create Ed25519 keypair client-side
2. **Register:** Submit AddOrderlyKey EIP-712 signature
3. **Store:** Encrypt private key, store in database
4. **Use:** Sign every authenticated API request
5. **Expire:** Max 365 days validity
6. **Rotate:** Generate new key before expiration

**Scopes:**
- `read`: Query balances, positions, orders
- `trading`: Place/cancel orders (includes read)
- `asset`: Withdrawals (requires separate EIP-712 signature)

---

### 3. Broker ID (Builder ID)

**Definition:** Identifier for the platform integrating Orderly.

**Examples:**
- `woofi_pro` - WOOFi Pro DEX
- `orderly` - Orderly's own frontend

**How to Get:**
- **API Traders:** Choose from existing builders
- **Platform Builders:** Email product@orderly.network

**Implications:**
- Affects fee structure (base fee + builder fee)
- Determines account isolation
- Required for all registrations

---

### 4. Registration Nonce

**Definition:** Single-use token for account registration.

**Properties:**
- Valid for **2 minutes** only
- One-time use per registration
- Obtained from `GET /v1/registration_nonce`

**Flow:**
```
1. GET /v1/registration_nonce → nonce: "194528949540"
2. Sign EIP-712 message with nonce
3. POST /v1/register_account (within 2 min)
4. Nonce consumed (cannot reuse)
```

---

### 5. EIP-712 Typed Data Signing

**Definition:** Standard for signing structured data (not raw transactions).

**Used For:**
- Account registration (Registration type)
- Orderly key addition (AddOrderlyKey type)
- Withdrawals (Withdraw type)
- PnL settlement (SettlePnl type)

**Domain (Off-Chain Operations):**
```typescript
{
  name: "Orderly",
  version: "1",
  chainId: 421614,  // Target chain
  verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"  // Null
}
```

**Example Message Types:**

**Registration:**
```typescript
{
  Registration: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'registrationNonce', type: 'uint256' }
  ]
}
```

**AddOrderlyKey:**
```typescript
{
  AddOrderlyKey: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'orderlyKey', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'expiration', type: 'uint64' }
  ]
}
```

---

## Supported Chains & Addresses

### Mainnet Deployments

| Chain | Chain ID | USDC Address | Vault Address |
|-------|----------|--------------|---------------|
| **Arbitrum One** | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0x816f722424B49Cf1275cc86DA9840Fbd5a6167e9` |
| **Optimism** | 10 | `0x0b2c639c533813f4aa9d7837caf62653d097ff85` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **Base** | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **Polygon** | 137 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **Mantle** | 5000 | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **Avalanche** | 43114 | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **BSC** | 56 | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| **Ethereum** | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |

**Note:** Vault address is **identical across all chains** (`0x816f...`).

### Testnet Deployments

| Chain | Chain ID | USDC Address | Vault Address |
|-------|----------|--------------|---------------|
| **Arbitrum Sepolia** | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | `0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f` |
| **Sepolia** | 11155111 | `0x7e8178DB74092e4E6C11FfE5b85B8Ab2F573d1c4` | `0x9d6ac51b81f4c28e05b0395e57d89f3c1A217cbb` |
| **Fuji (Avalanche)** | 43113 | `0x98e4c1492781A13A3ba4c92894D8f4A6ceC0f4DE` | `0x10DaaEb35FBfDEFb00e83E9a2a773E9A6C5999eE` |

---

## Quick Start Path

### Prerequisites

1. **Broker ID:** Use `woofi_pro` for testnet
2. **Chain:** Arbitrum Sepolia (421614)
3. **Wallet:** EVM wallet with testnet ETH
4. **USDC:** Testnet USDC at `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

### 30-Minute Integration Path

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Account Registration (5 min)                         │
├──────────────────────────────────────────────────────────────┤
│ 1. GET /v1/registration_nonce                                │
│ 2. Sign EIP-712 Registration message                         │
│ 3. POST /v1/register_account                                 │
│ 4. Receive account_id                                        │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Orderly Key Setup (5 min)                           │
├──────────────────────────────────────────────────────────────┤
│ 1. Generate Ed25519 keypair                                  │
│ 2. Sign EIP-712 AddOrderlyKey message                        │
│ 3. POST /v1/orderly_key                                      │
│ 4. Store private key (encrypted)                             │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Deposit Funds (10 min)                              │
├──────────────────────────────────────────────────────────────┤
│ 1. Approve USDC to Vault contract                            │
│ 2. Call deposit(accountId, brokerHash, tokenHash, amount)   │
│ 3. Wait for settlement (~30 sec)                             │
│ 4. Verify balance via GET /v1/client/holding                 │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: Place First Order (10 min)                          │
├──────────────────────────────────────────────────────────────┤
│ 1. Get market price: GET /v1/public/market_trades           │
│ 2. Build order body with symbol, side, quantity              │
│ 3. Sign with Ed25519 key                                     │
│ 4. POST /v1/order with auth headers                          │
│ 5. Receive order_id confirmation                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Read:** [ORDERLY_INTEGRATION_GUIDE.md](ORDERLY_INTEGRATION_GUIDE.md) for complete API reference
2. **Fix:** Apply code fixes outlined in Critical Issues section
3. **Test:** Run integration test script (coming next)
4. **Deploy:** Follow go-live checklist

---

## Documentation Sources

All information extracted from official Orderly Network documentation (accessed 2025-11-01):

1. [Building on Omnichain](https://orderly.network/docs/build-on-omnichain/building-on-omnichain)
2. [Overview](https://orderly.network/docs/build-on-omnichain/overview)
3. [Smart Contract Addresses](https://orderly.network/docs/build-on-omnichain/addresses)
4. [Integration Checklist](https://orderly.network/docs/build-on-omnichain/integration-checklist)
5. [Integration FAQs](https://orderly.network/docs/build-on-omnichain/integration-faqs)
6. [Account Flows](https://orderly.network/docs/build-on-omnichain/user-flows/accounts)
7. [Wallet Authentication](https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication)
8. [Deposit/Withdrawal](https://orderly.network/docs/build-on-omnichain/user-flows/withdrawal-deposit)
9. [API Introduction](https://orderly.network/docs/build-on-omnichain/evm-api/introduction)
10. [API Authentication](https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication)
11. [Error Codes](https://orderly.network/docs/build-on-omnichain/evm-api/error-codes)
12. [Get Builder List](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/get-builder-list)
13. [Get All Accounts](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/get-all-accounts)
14. [Get Registration Nonce](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/get-registration-nonce)
15. [Register Account](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/register-account)
16. [Get Orderly Key](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/get-orderly-key)
17. [Create Order](https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-order)

---

**End of Critical Findings Document**
