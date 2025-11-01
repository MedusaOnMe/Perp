import { ParsedCommand } from '../models/types';

export class ParserService {
  /**
   * Parse a tweet command
   * @param tweetText - The raw tweet text
   * @returns Parsed command object
   */
  parseCommand(tweetText: string): ParsedCommand {
    const text = tweetText.toLowerCase().trim();

    // Remove bot mention if present
    const cleanText = text.replace(/@\w+/g, '').trim();

    // REGISTER
    if (this.matchesPattern(cleanText, /register/)) {
      return { type: 'register' };
    }

    // BALANCE
    if (this.matchesPattern(cleanText, /balance/)) {
      return { type: 'balance' };
    }

    // EXPORT WITH CODE
    const exportCodeMatch = cleanText.match(/export\s+(\d{6})/);
    if (exportCodeMatch) {
      return {
        type: 'export',
        code: exportCodeMatch[1]
      };
    }

    // EXPORT (request)
    if (this.matchesPattern(cleanText, /export/)) {
      return { type: 'export' };
    }

    // LONG
    // Examples:
    // - "long BTC 100 USDC x5"
    // - "long ETH 50 x3"
    // - "long BTC 100 x10"
    const longMatch = cleanText.match(
      /long\s+(\w+)\s+([\d.]+)(?:\s+usdc)?\s+x([\d.]+)/i
    );
    if (longMatch) {
      return {
        type: 'long',
        asset: longMatch[1].toUpperCase(),
        amount: parseFloat(longMatch[2]),
        leverage: parseFloat(longMatch[3])
      };
    }

    // SHORT
    // Examples:
    // - "short BTC 100 USDC x5"
    // - "short ETH 50 x3"
    const shortMatch = cleanText.match(
      /short\s+(\w+)\s+([\d.]+)(?:\s+usdc)?\s+x([\d.]+)/i
    );
    if (shortMatch) {
      return {
        type: 'short',
        asset: shortMatch[1].toUpperCase(),
        amount: parseFloat(shortMatch[2]),
        leverage: parseFloat(shortMatch[3])
      };
    }

    // CLOSE
    // Examples:
    // - "close BTC"
    // - "close all"
    const closeMatch = cleanText.match(/close\s+(\w+)/i);
    if (closeMatch) {
      return {
        type: 'close',
        asset: closeMatch[1].toUpperCase()
      };
    }

    throw new Error(
      'Invalid command format. Use: register | balance | long <asset> <amount> x<leverage> | short <asset> <amount> x<leverage> | close <asset> | export'
    );
  }

  /**
   * Validate a parsed command
   * @param command - The parsed command
   * @throws Error if validation fails
   */
  validateCommand(command: ParsedCommand): void {
    switch (command.type) {
      case 'long':
      case 'short':
        if (!command.asset) {
          throw new Error('Asset is required');
        }
        if (!command.amount || command.amount <= 0) {
          throw new Error('Amount must be greater than 0');
        }
        if (!command.leverage || command.leverage <= 0) {
          throw new Error('Leverage must be greater than 0');
        }
        if (command.leverage > 10) {
          throw new Error('Maximum leverage is 10x');
        }
        break;

      case 'close':
        if (!command.asset) {
          throw new Error('Asset is required for close command');
        }
        break;

      case 'export':
        // Export with code should have 6 digits
        if (command.code && command.code.length !== 6) {
          throw new Error('Export code must be 6 digits');
        }
        break;

      case 'register':
      case 'balance':
        // No validation needed
        break;

      default:
        throw new Error('Unknown command type');
    }
  }

  /**
   * Check if text matches a pattern
   */
  private matchesPattern(text: string, pattern: RegExp): boolean {
    return pattern.test(text);
  }

  /**
   * Normalize a Twitter handle (remove @ and lowercase)
   */
  normalizeHandle(handle: string): string {
    return handle.toLowerCase().replace('@', '').trim();
  }

  /**
   * Convert asset symbol to Orderly symbol format
   * @param asset - Asset symbol (e.g., "BTC", "ETH")
   * @returns Orderly symbol (e.g., "PERP_BTC_USDC")
   */
  toOrderlySymbol(asset: string): string {
    return `PERP_${asset.toUpperCase()}_USDC`;
  }
}

// Singleton instance
export const parserService = new ParserService();
