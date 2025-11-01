// Orderly Network Configuration
// Based on: https://orderly.network/docs/build-on-omnichain/addresses

import dotenv from 'dotenv';
dotenv.config();

export type NetworkEnvironment = 'mainnet' | 'testnet';

interface ChainAddresses {
  chainId: number;
  chainName: string;
  usdc?: string;
  usdt?: string;
  vault?: string;
}

interface OrderlyL2Addresses {
  chainId: number;
  ledger: string;
}

// ============================================================================
// SUPPORTED CHAINS
// ============================================================================

const ARBITRUM_ONE: ChainAddresses = {
  chainId: 42161,
  chainName: 'Arbitrum One',
  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  vault: '0x816f722424B49Cf1275cc86DA9840Fbd5a6167e9',
};

const ARBITRUM_SEPOLIA: ChainAddresses = {
  chainId: 421614,
  chainName: 'Arbitrum Sepolia',
  usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  usdt: '0xEf54C221Fc94517877F0F40eCd71E0A3866D66C2',
  vault: '0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f',
};

const OPTIMISM_MAINNET: ChainAddresses = {
  chainId: 10,
  chainName: 'Optimism',
  usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
  vault: '0x816f722424b49cf1275cc86da9840fbd5a6167e9',
};

const OPTIMISM_SEPOLIA: ChainAddresses = {
  chainId: 11155420,
  chainName: 'Optimism Sepolia',
  usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  vault: '0xEfF2896077B6ff95379EfA89Ff903598190805EC',
};

// ============================================================================
// ORDERLY L2
// ============================================================================

const ORDERLY_L2_MAINNET: OrderlyL2Addresses = {
  chainId: 291,
  ledger: '0x6F7a338F2aA472838dEFD3283eB360d4Dff5D203',
};

const ORDERLY_L2_TESTNET: OrderlyL2Addresses = {
  chainId: 291,
  ledger: '0x1826B75e2ef249173FC735149AE4B8e9ea10abff',
};

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OrderlyConfig {
  environment: NetworkEnvironment;
  apiBaseUrl: string;
  brokerId: string;
  chainId: number;
  chainAddresses: ChainAddresses;
  orderlyL2: OrderlyL2Addresses;
}

class OrderlyConfigManager {
  private config: OrderlyConfig;

  constructor() {
    const environment = (process.env.ORDERLY_ENVIRONMENT || 'mainnet') as NetworkEnvironment;
    const chainId = parseInt(process.env.ORDERLY_CHAIN_ID || '42161', 10);

    this.config = {
      environment,
      apiBaseUrl: this.getApiBaseUrl(environment),
      brokerId: process.env.ORDERLY_BROKER_ID || 'woofi_dex',
      chainId,
      chainAddresses: this.getChainAddresses(chainId, environment),
      orderlyL2: this.getOrderlyL2Addresses(environment),
    };

    this.validate();
  }

  private getApiBaseUrl(environment: NetworkEnvironment): string {
    if (environment === 'mainnet') {
      return process.env.ORDERLY_API_URL || 'https://api-evm.orderly.org';
    }
    return process.env.ORDERLY_API_URL || 'https://testnet-api-evm.orderly.org';
  }

  private getChainAddresses(chainId: number, environment: NetworkEnvironment): ChainAddresses {
    const chainMap: Record<number, ChainAddresses> = {
      // Mainnet
      42161: ARBITRUM_ONE,
      10: OPTIMISM_MAINNET,
      // Testnet
      421614: ARBITRUM_SEPOLIA,
      11155420: OPTIMISM_SEPOLIA,
    };

    const addresses = chainMap[chainId];

    if (!addresses) {
      throw new Error(
        `Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(chainMap).join(', ')}`
      );
    }

    return addresses;
  }

  private getOrderlyL2Addresses(environment: NetworkEnvironment): OrderlyL2Addresses {
    return environment === 'mainnet' ? ORDERLY_L2_MAINNET : ORDERLY_L2_TESTNET;
  }

  private validate(): void {
    if (!this.config.brokerId) {
      throw new Error('ORDERLY_BROKER_ID environment variable is required');
    }

    if (!this.config.chainId) {
      throw new Error('ORDERLY_CHAIN_ID environment variable is required');
    }
  }

  getConfig(): OrderlyConfig {
    return this.config;
  }

  getVaultAddress(): string {
    if (!this.config.chainAddresses.vault) {
      throw new Error(`Vault address not configured for chain ${this.config.chainId}`);
    }
    return this.config.chainAddresses.vault;
  }

  getUSDCAddress(): string {
    if (!this.config.chainAddresses.usdc) {
      throw new Error(`USDC address not configured for chain ${this.config.chainId}`);
    }
    return this.config.chainAddresses.usdc;
  }

  getUSDTAddress(): string | undefined {
    return this.config.chainAddresses.usdt;
  }

  getLedgerAddress(): string {
    return this.config.orderlyL2.ledger;
  }
}

// Singleton instance
export const orderlyConfig = new OrderlyConfigManager();

// ============================================================================
// SYMBOL FORMATS
// ============================================================================

export const SYMBOL_FORMAT = {
  /**
   * Create Orderly symbol format: PERP_<SYMBOL>_USDC
   */
  create: (symbol: string): string => {
    return `PERP_${symbol.toUpperCase()}_USDC`;
  },

  /**
   * Parse Orderly symbol to extract base symbol
   */
  parse: (orderlySymbol: string): string | null => {
    const match = orderlySymbol.match(/^PERP_(.+)_USDC$/);
    return match ? match[1] : null;
  },
};
