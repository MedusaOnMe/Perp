// Orderly Wallet Authentication & EIP-712 Signing
// Based on: https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication

import { ethers } from 'ethers';
import {
  EIP712Domain,
  RegisterAccountMessage,
  AddOrderlyKeyMessage,
  WithdrawMessage,
  SettlePnlMessage,
  ChainType,
} from './orderly-types';

// Off-chain EIP-712 domain (registration, add key, etc.)
const OFF_CHAIN_VERIFYING_CONTRACT = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC';

// EIP-712 type definitions
const REGISTRATION_TYPES = {
  Registration: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'chainType', type: 'string' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'registrationNonce', type: 'uint64' },
  ],
};

const ADD_ORDERLY_KEY_TYPES = {
  AddOrderlyKey: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'orderlyKey', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'expiration', type: 'uint64' },
  ],
};

const WITHDRAW_TYPES = {
  Withdraw: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'receiver', type: 'address' },
    { name: 'token', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'withdrawNonce', type: 'uint64' },
    { name: 'timestamp', type: 'uint64' },
  ],
};

const SETTLE_PNL_TYPES = {
  SettlePnl: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'settleNonce', type: 'uint64' },
    { name: 'timestamp', type: 'uint64' },
  ],
};

export class OrderlyWallet {
  private wallet: ethers.Wallet;

  constructor(privateKey: string) {
    this.wallet = new ethers.Wallet(privateKey);
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Calculate account ID from wallet address and broker ID
   * Algorithm: keccak256(abi.encode(wallet_bytes, keccak256(broker_id_bytes)))
   */
  static calculateAccountId(walletAddress: string, brokerId: string): string {
    // Convert wallet address to bytes
    const walletBytes = ethers.utils.arrayify(walletAddress);

    // Hash broker ID
    const brokerHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(brokerId));

    // ABI encode both values
    const encoded = ethers.utils.defaultAbiCoder.encode(
      ['bytes', 'bytes32'],
      [walletBytes, brokerHash]
    );

    // Final keccak256 hash
    const accountId = ethers.utils.keccak256(encoded);

    return accountId;
  }

  /**
   * Sign Registration message (EIP-712)
   */
  async signRegistration(
    brokerId: string,
    chainId: number,
    registrationNonce: string
  ): Promise<{ message: RegisterAccountMessage; signature: string }> {
    const timestamp = Date.now();

    const message: RegisterAccountMessage = {
      brokerId,
      chainId,
      chainType: 'EVM' as ChainType,
      timestamp: timestamp.toString(),
      registrationNonce,
    };

    const domain = this.createDomain(chainId, OFF_CHAIN_VERIFYING_CONTRACT);

    const signature = await this.wallet._signTypedData(
      domain,
      REGISTRATION_TYPES,
      message
    );

    return { message, signature };
  }

  /**
   * Sign AddOrderlyKey message (EIP-712)
   */
  async signAddOrderlyKey(
    brokerId: string,
    chainId: number,
    orderlyKey: string,
    scope: string,
    expirationDays: number = 365
  ): Promise<{ message: AddOrderlyKeyMessage; signature: string }> {
    const timestamp = Date.now();
    const expiration = timestamp + expirationDays * 24 * 60 * 60 * 1000;

    // Format orderly key with prefix if not already present
    const formattedKey = orderlyKey.startsWith('ed25519:')
      ? orderlyKey
      : `ed25519:${orderlyKey}`;

    const message: AddOrderlyKeyMessage = {
      brokerId,
      chainId,
      orderlyKey: formattedKey,
      scope,
      timestamp,
      expiration,
    };

    const domain = this.createDomain(chainId, OFF_CHAIN_VERIFYING_CONTRACT);

    const signature = await this.wallet._signTypedData(
      domain,
      ADD_ORDERLY_KEY_TYPES,
      message
    );

    return { message, signature };
  }

  /**
   * Sign Withdraw message (EIP-712)
   * Uses Ledger contract address as verifying contract
   */
  async signWithdraw(
    brokerId: string,
    chainId: number,
    receiver: string,
    token: string,
    amount: string,
    withdrawNonce: number,
    ledgerAddress: string
  ): Promise<{ message: WithdrawMessage; signature: string }> {
    const timestamp = Date.now();

    const message: WithdrawMessage = {
      brokerId,
      chainId,
      receiver,
      token,
      amount,
      withdrawNonce,
      timestamp,
    };

    const domain = this.createDomain(chainId, ledgerAddress);

    const signature = await this.wallet._signTypedData(
      domain,
      WITHDRAW_TYPES,
      message
    );

    return { message, signature };
  }

  /**
   * Sign SettlePnl message (EIP-712)
   */
  async signSettlePnl(
    brokerId: string,
    chainId: number,
    settleNonce: number,
    ledgerAddress: string
  ): Promise<{ message: SettlePnlMessage; signature: string }> {
    const timestamp = Date.now();

    const message: SettlePnlMessage = {
      brokerId,
      chainId,
      settleNonce,
      timestamp,
    };

    const domain = this.createDomain(chainId, ledgerAddress);

    const signature = await this.wallet._signTypedData(
      domain,
      SETTLE_PNL_TYPES,
      message
    );

    return { message, signature };
  }

  /**
   * Create EIP-712 domain
   */
  private createDomain(chainId: number, verifyingContract: string): EIP712Domain {
    return {
      name: 'Orderly',
      version: '1',
      chainId,
      verifyingContract,
    };
  }
}

/**
 * Complete registration flow
 */
export async function registerUserAccount(
  wallet: OrderlyWallet,
  apiClient: any,
  brokerId: string,
  chainId: number
): Promise<string> {
  // Step 1: Get registration nonce
  const { registration_nonce } = await apiClient.getRegistrationNonce();

  // Step 2: Sign registration message
  const { message, signature } = await wallet.signRegistration(
    brokerId,
    chainId,
    registration_nonce
  );

  // Step 3: Register account
  const { account_id } = await apiClient.registerAccount({
    message,
    signature,
    userAddress: wallet.getAddress(),
  });

  return account_id;
}

/**
 * Add Orderly key flow
 */
export async function addOrderlyKeyToAccount(
  wallet: OrderlyWallet,
  apiClient: any,
  brokerId: string,
  chainId: number,
  orderlyKeyBase58: string,
  scope: string = 'trading'
): Promise<void> {
  // Sign add orderly key message
  const { message, signature } = await wallet.signAddOrderlyKey(
    brokerId,
    chainId,
    orderlyKeyBase58,
    scope
  );

  // Submit to API
  await apiClient.addOrderlyKey({
    message,
    signature,
    userAddress: wallet.getAddress(),
  });
}
