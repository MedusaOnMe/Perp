// Orderly Network EVM API - Type Definitions
// Based on: https://orderly.network/docs/build-on-omnichain/evm-api

// ============================================================================
// COMMON TYPES
// ============================================================================

export type ChainType = 'EVM' | 'SOL';
export type UserType = 'SUB' | 'MAIN' | 'SP' | 'PV' | 'UV';
export type OrderType = 'LIMIT' | 'MARKET' | 'IOC' | 'FOK' | 'POST_ONLY' | 'ASK' | 'BID';
export type OrderSide = 'BUY' | 'SELL';
export type OrderScope = 'read' | 'trading' | 'asset';

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

export interface OrderlySuccessResponse<T> {
  success: true;
  timestamp: number;
  data: T;
}

export interface OrderlyErrorResponse {
  success: false;
  code: number;
  message: string;
}

export type OrderlyResponse<T> = OrderlySuccessResponse<T> | OrderlyErrorResponse;

// ============================================================================
// PUBLIC ENDPOINTS - REQUEST/RESPONSE TYPES
// ============================================================================

// GET /v1/public/broker/name
export interface GetBuilderListRequest {
  broker_id?: string;
}

export interface BuilderInfo {
  broker_id: string;
  broker_name: string;
}

export interface GetBuilderListResponse {
  rows: BuilderInfo[];
}

// GET /v1/get_all_accounts
export interface GetAllAccountsRequest {
  address: string;
  broker_id: string;
  chain_type?: ChainType;
}

export interface AccountInfo {
  user_id: number;
  account_id: string;
  broker_id: string;
  chain_type: ChainType;
  user_type: UserType;
}

export interface GetAllAccountsResponse {
  rows: AccountInfo[];
}

// GET /v1/registration_nonce
export interface GetRegistrationNonceResponse {
  registration_nonce: string;
}

// POST /v1/register_account
export interface RegisterAccountMessage {
  brokerId: string;
  chainId: number;
  chainType: ChainType;
  timestamp: string;
  registrationNonce: string;
}

export interface RegisterAccountRequest {
  message: RegisterAccountMessage;
  signature: string;
  userAddress: string;
}

export interface RegisterAccountResponse {
  account_id: string;
}

// GET /v1/get_orderly_key
export interface GetOrderlyKeyRequest {
  account_id: string;
  orderly_key: string;
}

export interface OrderlyKeyInfo {
  orderly_key: string;
  scope: string;
  expiration: number;
  tag: string;
}

export type GetOrderlyKeyResponse = OrderlyKeyInfo;

// POST /v1/orderly_key
export interface AddOrderlyKeyMessage {
  brokerId: string;
  chainId: number;
  orderlyKey: string;
  scope: string;
  timestamp: number;
  expiration: number;
}

export interface AddOrderlyKeyRequest {
  message: AddOrderlyKeyMessage;
  signature: string;
  userAddress: string;
}

// ============================================================================
// PRIVATE ENDPOINTS - REQUEST/RESPONSE TYPES
// ============================================================================

// POST /v1/order
export interface CreateOrderRequest {
  symbol: string;
  order_type: OrderType;
  side: OrderSide;
  order_price?: number;
  order_quantity?: number;
  order_amount?: number;
  client_order_id?: string;
  visible_quantity?: number;
  reduce_only?: boolean;
  slippage?: number;
  order_tag?: string;
  level?: number;
  post_only_adjust?: boolean;
}

export interface CreateOrderResponse {
  order_id: number;
  client_order_id?: string;
  order_type: string;
  order_price?: number;
  order_quantity?: number;
  order_amount?: number;
  error_message?: string;
}

// ============================================================================
// EIP-712 MESSAGE TYPES
// ============================================================================

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface WithdrawMessage {
  brokerId: string;
  chainId: number;
  receiver: string;
  token: string;
  amount: string;
  withdrawNonce: number;
  timestamp: number;
}

export interface SettlePnlMessage {
  brokerId: string;
  chainId: number;
  settleNonce: number;
  timestamp: number;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface OrderlyAuthHeaders {
  'Content-Type': 'application/json' | 'application/x-www-form-urlencoded';
  'orderly-timestamp': string;
  'orderly-account-id': string;
  'orderly-key': string;
  'orderly-signature': string;
  'x-recv-window'?: string;
}

export interface SignaturePayload {
  timestamp: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: string;
}

// ============================================================================
// BLOCKCHAIN TYPES
// ============================================================================

export interface DepositData {
  accountId: string; // bytes32
  brokerHash: string; // bytes32
  tokenHash: string; // bytes32
  tokenAmount: string; // uint128
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum OrderlyErrorCode {
  UNKNOWN = -1000,
  INVALID_SIGNATURE = -1001,
  UNAUTHORIZED = -1002,
  TOO_MANY_REQUEST = -1003,
  UNKNOWN_PARAM = -1004,
  INVALID_PARAM = -1005,
  RESOURCE_NOT_FOUND = -1006,
  DUPLICATE_REQUEST = -1007,
  QUANTITY_TOO_HIGH = -1008,
  CAN_NOT_WITHDRAWAL = -1009,
  RPC_NOT_CONNECT = -1011,
  RPC_REJECT = -1012,
  RISK_TOO_HIGH = -1101,
  MIN_NOTIONAL = -1102,
  PRICE_FILTER = -1103,
  SIZE_FILTER = -1104,
  PERCENTAGE_FILTER = -1105,
  LIQUIDATION_REQUEST_RATIO_TOO_SMALL = -1201,
  LIQUIDATION_STATUS_ERROR = -1202,
}

export interface ErrorCodeInfo {
  code: OrderlyErrorCode;
  httpStatus: number;
  name: string;
  description: string;
}
