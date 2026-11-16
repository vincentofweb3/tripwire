import type { Abi } from "viem";

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }
] as const satisfies Abi;

export const poolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" }
    ]
  }
] as const satisfies Abi;

export const executorAbi = [
  {
    type: "function",
    name: "createOrder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "sellToken", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "triggerSqrtPriceX96", type: "uint160" },
      { name: "fireAbove", type: "bool" },
      { name: "deadline", type: "uint64" },
      { name: "recipient", type: "address" }
    ],
    outputs: [{ name: "orderId", type: "uint256" }]
  },
  { type: "function", name: "cancelOrder", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }], outputs: [] },
  { type: "function", name: "orderCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "ordersOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256[]" }] },
  {
    type: "function",
    name: "orders",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "recipient", type: "address" },
      { name: "pool", type: "address" },
      { name: "sellToken", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "triggerSqrtPriceX96", type: "uint160" },
      { name: "fireAbove", type: "bool" },
      { name: "deadline", type: "uint64" },
      { name: "armed", type: "bool" }
    ]
  },
  {
    type: "event",
    name: "OrderCreated",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: false },
      { name: "sellToken", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOutMinimum", type: "uint256", indexed: false },
      { name: "triggerSqrtPriceX96", type: "uint160", indexed: false },
      { name: "fireAbove", type: "bool", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "recipient", type: "address", indexed: false }
    ]
  },
  {
    type: "event",
    name: "OrderExecuted",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "OrderSkipped",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "reason", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "OrderCancelled",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "refunded", type: "uint256", indexed: false }
    ]
  }
] as const satisfies Abi;
