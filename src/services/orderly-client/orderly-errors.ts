// Orderly Network Error Code Mapping
// Based on: https://orderly.network/docs/build-on-omnichain/evm-api/error-codes

import { OrderlyErrorCode, ErrorCodeInfo } from './orderly-types';

export class OrderlyApiError extends Error {
  constructor(
    public code: number,
    public message: string,
    public httpStatus?: number
  ) {
    super(`[Orderly ${code}] ${message}`);
    this.name = 'OrderlyApiError';
  }
}

// Complete error code mapping
export const ERROR_CODE_MAP: Record<number, ErrorCodeInfo> = {
  [-1000]: {
    code: OrderlyErrorCode.UNKNOWN,
    httpStatus: 500,
    name: 'UNKNOWN',
    description: 'Unknown error or data doesn\'t exist',
  },
  [-1001]: {
    code: OrderlyErrorCode.INVALID_SIGNATURE,
    httpStatus: 401,
    name: 'INVALID_SIGNATURE',
    description: 'API key/secret in wrong format',
  },
  [-1002]: {
    code: OrderlyErrorCode.UNAUTHORIZED,
    httpStatus: 401,
    name: 'UNAUTHORIZED',
    description: 'Invalid, expired, revoked credentials or lack permissions',
  },
  [-1003]: {
    code: OrderlyErrorCode.TOO_MANY_REQUEST,
    httpStatus: 429,
    name: 'TOO_MANY_REQUEST',
    description: 'Rate limit exceeded',
  },
  [-1004]: {
    code: OrderlyErrorCode.UNKNOWN_PARAM,
    httpStatus: 400,
    name: 'UNKNOWN_PARAM',
    description: 'Unknown parameter sent',
  },
  [-1005]: {
    code: OrderlyErrorCode.INVALID_PARAM,
    httpStatus: 400,
    name: 'INVALID_PARAM',
    description: 'Improperly formatted parameters',
  },
  [-1006]: {
    code: OrderlyErrorCode.RESOURCE_NOT_FOUND,
    httpStatus: 400,
    name: 'RESOURCE_NOT_FOUND',
    description: 'Data not found in server',
  },
  [-1007]: {
    code: OrderlyErrorCode.DUPLICATE_REQUEST,
    httpStatus: 409,
    name: 'DUPLICATE_REQUEST',
    description: 'Data already exists or duplicate request',
  },
  [-1008]: {
    code: OrderlyErrorCode.QUANTITY_TOO_HIGH,
    httpStatus: 400,
    name: 'QUANTITY_TOO_HIGH',
    description: 'Settlement quantity exceeds limits',
  },
  [-1009]: {
    code: OrderlyErrorCode.CAN_NOT_WITHDRAWAL,
    httpStatus: 400,
    name: 'CAN_NOT_WITHDRAWAL',
    description: 'Withdrawal blocked; arrears must be settled',
  },
  [-1011]: {
    code: OrderlyErrorCode.RPC_NOT_CONNECT,
    httpStatus: 400,
    name: 'RPC_NOT_CONNECT',
    description: 'Internal network failure',
  },
  [-1012]: {
    code: OrderlyErrorCode.RPC_REJECT,
    httpStatus: 400,
    name: 'RPC_REJECT',
    description: 'Order rejected (liquidation or internal error)',
  },
  [-1101]: {
    code: OrderlyErrorCode.RISK_TOO_HIGH,
    httpStatus: 400,
    name: 'RISK_TOO_HIGH',
    description: 'Excessive risk from order size/leverage/margin',
  },
  [-1102]: {
    code: OrderlyErrorCode.MIN_NOTIONAL,
    httpStatus: 400,
    name: 'MIN_NOTIONAL',
    description: 'Order value (price * size) too small',
  },
  [-1103]: {
    code: OrderlyErrorCode.PRICE_FILTER,
    httpStatus: 400,
    name: 'PRICE_FILTER',
    description: 'Price violates scope/range requirements',
  },
  [-1104]: {
    code: OrderlyErrorCode.SIZE_FILTER,
    httpStatus: 400,
    name: 'SIZE_FILTER',
    description: 'Quantity doesn\'t conform to step-size',
  },
  [-1105]: {
    code: OrderlyErrorCode.PERCENTAGE_FILTER,
    httpStatus: 400,
    name: 'PERCENTAGE_FILTER',
    description: 'Price deviates excessively from mid-market',
  },
  [-1201]: {
    code: OrderlyErrorCode.LIQUIDATION_REQUEST_RATIO_TOO_SMALL,
    httpStatus: 400,
    name: 'LIQUIDATION_REQUEST_RATIO_TOO_SMALL',
    description: 'Liquidation ratio requirements unmet',
  },
  [-1202]: {
    code: OrderlyErrorCode.LIQUIDATION_STATUS_ERROR,
    httpStatus: 400,
    name: 'LIQUIDATION_STATUS_ERROR',
    description: 'Liquidation unnecessary or invalid ID',
  },
};

export function createOrderlyError(code: number, message: string): OrderlyApiError {
  const errorInfo = ERROR_CODE_MAP[code];

  if (!errorInfo) {
    return new OrderlyApiError(code, message);
  }

  // Enhance message with error name and actionable description
  const enhancedMessage = `${errorInfo.name}: ${message}. ${errorInfo.description}`;
  return new OrderlyApiError(code, enhancedMessage, errorInfo.httpStatus);
}

// Helper to check if error is retryable
export function isRetryableError(code: number): boolean {
  const nonRetryableCodes = [
    OrderlyErrorCode.INVALID_SIGNATURE,
    OrderlyErrorCode.UNAUTHORIZED,
    OrderlyErrorCode.INVALID_PARAM,
    OrderlyErrorCode.UNKNOWN_PARAM,
    OrderlyErrorCode.DUPLICATE_REQUEST,
  ];
  return !nonRetryableCodes.includes(code);
}

// Helper to check if error is auth-related (clock skew)
export function isClockSkewError(code: number, message: string): boolean {
  return (
    code === OrderlyErrorCode.UNAUTHORIZED &&
    (message.toLowerCase().includes('timestamp') || message.toLowerCase().includes('expired'))
  );
}
