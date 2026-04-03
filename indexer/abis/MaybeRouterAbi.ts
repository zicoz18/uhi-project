export const MaybeRouterAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_poolManager",
        type: "address",
        internalType: "contract IPoolManager",
      },
      {
        name: "_maybeToken",
        type: "address",
        internalType: "contract IMaybeToken",
      },
      {
        name: "_zRouter",
        type: "address",
        internalType: "contract IzRouter",
      },
      {
        name: "_maybeEthPool",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          {
            name: "currency0",
            type: "address",
            internalType: "Currency",
          },
          {
            name: "currency1",
            type: "address",
            internalType: "Currency",
          },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "tickSpacing", type: "int24", internalType: "int24" },
          {
            name: "hooks",
            type: "address",
            internalType: "contract IHooks",
          },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "maybeEthPool",
    inputs: [],
    outputs: [
      { name: "currency0", type: "address", internalType: "Currency" },
      { name: "currency1", type: "address", internalType: "Currency" },
      { name: "fee", type: "uint24", internalType: "uint24" },
      { name: "tickSpacing", type: "int24", internalType: "int24" },
      {
        name: "hooks",
        type: "address",
        internalType: "contract IHooks",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maybeSwap",
    inputs: [
      {
        name: "exactInToken",
        type: "address",
        internalType: "address",
      },
      {
        name: "exactInAmount",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "multicall", type: "bytes", internalType: "bytes" },
      {
        name: "sqrtPriceLimitX96",
        type: "uint160",
        internalType: "uint160",
      },
      {
        name: "probabilityInBps",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "swapBackOnlyToEth", type: "bool", internalType: "bool" },
      {
        name: "swapBackSqrtPriceLimitX96",
        type: "uint160",
        internalType: "uint160",
      },
      { name: "swapBackParams", type: "bytes", internalType: "bytes" },
      {
        name: "swapBackIntendedOutToken",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "maybeToken",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IMaybeToken",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolManager",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unlockCallback",
    inputs: [{ name: "rawData", type: "bytes", internalType: "bytes" }],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "zRouter",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IzRouter" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "SwapBeforeMaybifying",
    inputs: [
      {
        name: "maybifyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "swapper",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "inToken",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "inTokenAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "InTokenCantBeMaybe", inputs: [] },
  {
    type: "error",
    name: "OnlyPoolManagerCanTriggerCallback",
    inputs: [{ name: "caller", type: "address", internalType: "address" }],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
  },
  {
    type: "error",
    name: "SwappingEthToMaybeHitPriceLimitAndDidNotConsumeEthFully",
    inputs: [
      {
        name: "ethExpectedToSwap",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "actualyEthConsumed",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ZRouterCallToSwapInTokenToEthFailed",
    inputs: [{ name: "reason", type: "bytes", internalType: "bytes" }],
  },
] as const;
