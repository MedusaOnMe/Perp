import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { Deposit } from '../models/deposit';

dotenv.config();

// USDC Contract ABI (minimal - just what we need)
const USDC_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

export class BlockchainService {
  private provider: ethers.providers.JsonRpcProvider;
  private usdcAddress: string;
  private usdcContract: ethers.Contract;
  private chainId: number;

  constructor() {
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    this.chainId = parseInt(process.env.ORDERLY_CHAIN_ID || '42161');

    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // USDC on Arbitrum
    this.usdcAddress = process.env.USDC_CONTRACT_ADDRESS || '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

    this.usdcContract = new ethers.Contract(
      this.usdcAddress,
      USDC_ABI,
      this.provider
    );
  }

  /**
   * Get current block number
   */
  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get USDC balance of an address
   * @param address - Wallet address
   * @returns Balance in USDC (already formatted)
   */
  async getUSDCBalance(address: string): Promise<number> {
    const balance = await this.usdcContract.balanceOf(address);
    const decimals = await this.usdcContract.decimals();
    return parseFloat(ethers.utils.formatUnits(balance, decimals));
  }

  /**
   * Get transaction details
   * @param txHash - Transaction hash
   * @returns Transaction receipt
   */
  async getTransaction(txHash: string): Promise<ethers.providers.TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  /**
   * Verify a USDC deposit transaction
   * @param txHash - Transaction hash
   * @param expectedTo - Expected recipient address (platform wallet)
   * @param minAmount - Minimum expected amount (optional)
   * @returns Deposit details or null if invalid
   */
  async verifyUSDCDeposit(
    txHash: string,
    expectedTo: string,
    minAmount?: number
  ): Promise<{
    valid: boolean;
    amount: number;
    from: string;
    blockNumber: number;
    confirmations: number;
  } | null> {
    try {
      const receipt = await this.getTransaction(txHash);

      if (!receipt || !receipt.logs) {
        return null;
      }

      // Find Transfer event
      const transferEvent = receipt.logs.find(log => {
        return (
          log.address.toLowerCase() === this.usdcAddress.toLowerCase() &&
          log.topics[0] === ethers.utils.id('Transfer(address,address,uint256)')
        );
      });

      if (!transferEvent) {
        return null;
      }

      // Decode Transfer event
      const iface = new ethers.utils.Interface(USDC_ABI);
      const decoded = iface.parseLog(transferEvent);

      const from = decoded.args.from;
      const to = decoded.args.to;
      const value = decoded.args.value;

      // Verify recipient
      if (to.toLowerCase() !== expectedTo.toLowerCase()) {
        console.warn(`Transfer to wrong address: ${to} (expected ${expectedTo})`);
        return null;
      }

      // Parse amount
      const decimals = await this.usdcContract.decimals();
      const amount = parseFloat(ethers.utils.formatUnits(value, decimals));

      // Check minimum amount
      if (minAmount && amount < minAmount) {
        console.warn(`Amount too small: ${amount} USDC (minimum ${minAmount})`);
        return null;
      }

      // Get confirmations
      const currentBlock = await this.getCurrentBlock();
      const confirmations = currentBlock - receipt.blockNumber;

      return {
        valid: true,
        amount,
        from,
        blockNumber: receipt.blockNumber,
        confirmations
      };

    } catch (error) {
      console.error('Error verifying deposit:', error);
      return null;
    }
  }

  /**
   * Scan for USDC transfers to platform wallet
   * @param platformAddress - Platform wallet address
   * @param fromBlock - Start block
   * @param toBlock - End block (defaults to latest)
   * @returns Array of transfer events
   */
  async scanForDeposits(
    platformAddress: string,
    fromBlock: number,
    toBlock?: number
  ): Promise<Array<{
    txHash: string;
    from: string;
    amount: number;
    blockNumber: number;
  }>> {
    try {
      const currentBlock = toBlock || await this.getCurrentBlock();

      // Query Transfer events where 'to' is platform address
      const filter = this.usdcContract.filters.Transfer(null, platformAddress);

      const events = await this.usdcContract.queryFilter(
        filter,
        fromBlock,
        currentBlock
      );

      const decimals = await this.usdcContract.decimals();

      return events.map(event => {
        const amount = parseFloat(ethers.utils.formatUnits(event.args!.value, decimals));

        return {
          txHash: event.transactionHash,
          from: event.args!.from,
          amount,
          blockNumber: event.blockNumber
        };
      });

    } catch (error) {
      console.error('Error scanning for deposits:', error);
      return [];
    }
  }

  /**
   * Transfer USDC from platform wallet to another address
   * @param privateKey - Platform wallet private key (decrypted)
   * @param to - Recipient address
   * @param amount - Amount in USDC
   * @returns Transaction hash
   */
  async transferUSDC(
    privateKey: string,
    to: string,
    amount: number
  ): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const usdcWithSigner = this.usdcContract.connect(wallet);

      const decimals = await this.usdcContract.decimals();
      const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);

      console.log(`Transferring ${amount} USDC to ${to}...`);

      const tx = await usdcWithSigner.transfer(to, amountWei);

      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait(1); // Wait for 1 confirmation

      console.log(`✅ Transfer confirmed: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      console.error('Error transferring USDC:', error);
      throw new Error(`USDC transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Approve USDC spending (needed for Orderly deposits)
   * @param privateKey - Wallet private key (decrypted)
   * @param spender - Spender address (Orderly vault)
   * @param amount - Amount to approve
   * @returns Transaction hash
   */
  async approveUSDC(
    privateKey: string,
    spender: string,
    amount: number
  ): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const usdcWithSigner = this.usdcContract.connect(wallet);

      const decimals = await this.usdcContract.decimals();
      const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);

      console.log(`Approving ${amount} USDC for ${spender}...`);

      const tx = await usdcWithSigner.approve(spender, amountWei);
      await tx.wait(1);

      console.log(`✅ Approval confirmed: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      console.error('Error approving USDC:', error);
      throw new Error(`USDC approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get gas price for transactions
   */
  async getGasPrice(): Promise<ethers.BigNumber> {
    return await this.provider.getGasPrice();
  }

  /**
   * Estimate gas for USDC transfer
   */
  async estimateTransferGas(from: string, to: string, amount: number): Promise<ethers.BigNumber> {
    const decimals = await this.usdcContract.decimals();
    const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);

    return await this.usdcContract.estimateGas.transfer(to, amountWei, { from });
  }
}

// Singleton instance
export const blockchainService = new BlockchainService();
