export const MaybeHookAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "_owner", type: "address", internalType: "address" },
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
        name: "_protocolFeeInBps",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_lpFeeShareInBps",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "_vrfTimeout", type: "uint256", internalType: "uint256" },
      {
        name: "_vrfMinimumRequestConfirmations",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "_vrfCallbackGasLimit",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "_vrfV2PlusWrapper",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "HUNDRED_IN_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_PROBABILITY_IN_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "RESOLVER_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "afterAddLiquidity",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct ModifyLiquidityParams",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          {
            name: "liquidityDelta",
            type: "int256",
            internalType: "int256",
          },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "delta0", type: "int256", internalType: "BalanceDelta" },
      { name: "delta1", type: "int256", internalType: "BalanceDelta" },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "", type: "bytes4", internalType: "bytes4" },
      { name: "", type: "int256", internalType: "BalanceDelta" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "afterDonate",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      { name: "amount0", type: "uint256", internalType: "uint256" },
      { name: "amount1", type: "uint256", internalType: "uint256" },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "afterInitialize",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "sqrtPriceX96",
        type: "uint160",
        internalType: "uint160",
      },
      { name: "tick", type: "int24", internalType: "int24" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "afterRemoveLiquidity",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct ModifyLiquidityParams",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          {
            name: "liquidityDelta",
            type: "int256",
            internalType: "int256",
          },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "delta0", type: "int256", internalType: "BalanceDelta" },
      { name: "delta1", type: "int256", internalType: "BalanceDelta" },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "", type: "bytes4", internalType: "bytes4" },
      { name: "", type: "int256", internalType: "BalanceDelta" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "afterSwap",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct SwapParams",
        components: [
          { name: "zeroForOne", type: "bool", internalType: "bool" },
          {
            name: "amountSpecified",
            type: "int256",
            internalType: "int256",
          },
          {
            name: "sqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
        ],
      },
      { name: "delta", type: "int256", internalType: "BalanceDelta" },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "", type: "bytes4", internalType: "bytes4" },
      { name: "", type: "int128", internalType: "int128" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeAddLiquidity",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct ModifyLiquidityParams",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          {
            name: "liquidityDelta",
            type: "int256",
            internalType: "int256",
          },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeDonate",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      { name: "amount0", type: "uint256", internalType: "uint256" },
      { name: "amount1", type: "uint256", internalType: "uint256" },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeInitialize",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      { name: "sqrtPriceX96", type: "uint160", internalType: "uint160" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeRemoveLiquidity",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct ModifyLiquidityParams",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          {
            name: "liquidityDelta",
            type: "int256",
            internalType: "int256",
          },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeSwap",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      {
        name: "key",
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
      {
        name: "params",
        type: "tuple",
        internalType: "struct SwapParams",
        components: [
          { name: "zeroForOne", type: "bool", internalType: "bool" },
          {
            name: "amountSpecified",
            type: "int256",
            internalType: "int256",
          },
          {
            name: "sqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
        ],
      },
      { name: "hookData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "", type: "bytes4", internalType: "bytes4" },
      { name: "", type: "int256", internalType: "BeforeSwapDelta" },
      { name: "", type: "uint24", internalType: "uint24" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHookPermissions",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Hooks.Permissions",
        components: [
          {
            name: "beforeInitialize",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterInitialize",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "beforeAddLiquidity",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterAddLiquidity",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "beforeRemoveLiquidity",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterRemoveLiquidity",
            type: "bool",
            internalType: "bool",
          },
          { name: "beforeSwap", type: "bool", internalType: "bool" },
          { name: "afterSwap", type: "bool", internalType: "bool" },
          { name: "beforeDonate", type: "bool", internalType: "bool" },
          { name: "afterDonate", type: "bool", internalType: "bool" },
          {
            name: "beforeSwapReturnDelta",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterSwapReturnDelta",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterAddLiquidityReturnDelta",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "afterRemoveLiquidityReturnDelta",
            type: "bool",
            internalType: "bool",
          },
        ],
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getLinkToken",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract LinkTokenInterface",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMaybifySwap",
    inputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct MaybeHook.MaybifySwap",
        components: [
          {
            name: "maybifyParams",
            type: "tuple",
            internalType: "struct MaybeHook.MaybifyParams",
            components: [
              {
                name: "probabilityInBps",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "swapper",
                type: "address",
                internalType: "address",
              },
              {
                name: "swapBackOnlyToEth",
                type: "bool",
                internalType: "bool",
              },
              {
                name: "swapBackSqrtPriceLimitX96",
                type: "uint160",
                internalType: "uint160",
              },
              {
                name: "swapBackParams",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "swapBackIntendedOutToken",
                type: "address",
                internalType: "address",
              },
            ],
          },
          {
            name: "maybifyAmount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maybifiedAt",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "currentProtocolFeeInBps",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoleAdmin",
    inputs: [{ name: "role", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoleMember",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "index", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoleMemberCount",
    inputs: [{ name: "role", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoleMembers",
    inputs: [{ name: "role", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "hasRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "i_vrfV2PlusWrapper",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IVRFV2PlusWrapper",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestRegisteredMaybifyId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lpFeeShareInBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
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
    name: "maybify",
    inputs: [
      {
        name: "maybifyAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maybifyParams",
        type: "tuple",
        internalType: "struct MaybeHook.MaybifyParams",
        components: [
          {
            name: "probabilityInBps",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "swapper", type: "address", internalType: "address" },
          {
            name: "swapBackOnlyToEth",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "swapBackSqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
          {
            name: "swapBackParams",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "swapBackIntendedOutToken",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    outputs: [{ name: "maybifyId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "poolKey",
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
    name: "protocolFeeInBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rawFulfillRandomWords",
    inputs: [
      { name: "_requestId", type: "uint256", internalType: "uint256" },
      {
        name: "_randomWords",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "renounceRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      {
        name: "callerConfirmation",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestIdToMaybifySwap",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "maybifyParams",
        type: "tuple",
        internalType: "struct MaybeHook.MaybifyParams",
        components: [
          {
            name: "probabilityInBps",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "swapper", type: "address", internalType: "address" },
          {
            name: "swapBackOnlyToEth",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "swapBackSqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
          {
            name: "swapBackParams",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "swapBackIntendedOutToken",
            type: "address",
            internalType: "address",
          },
        ],
      },
      {
        name: "maybifyAmount",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "maybifiedAt", type: "uint256", internalType: "uint256" },
      {
        name: "currentProtocolFeeInBps",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "resolveAfterVRFTimeout",
    inputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLPFeeShareInBps",
    inputs: [
      {
        name: "_lpFeeShareInBps",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setProtocolFeeInBps",
    inputs: [
      {
        name: "_protocolFeeInBps",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setVRFCallbackGasLimit",
    inputs: [
      {
        name: "_vrfCallbackGasLimit",
        type: "uint32",
        internalType: "uint32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [{ name: "interfaceId", type: "bytes4", internalType: "bytes4" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
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
    name: "updateZRouter",
    inputs: [
      {
        name: "_zRouter",
        type: "address",
        internalType: "contract IzRouter",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vrfCallbackGasLimit",
    inputs: [],
    outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vrfMinimumRequestConfirmations",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vrfTimeout",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
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
    name: "MaybifiedSwapRegistered",
    inputs: [
      {
        name: "id",
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
        name: "probabilityInBps",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "burntAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "protocolFeeInBps",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "swapBackOnlyToEth",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
      {
        name: "swapBackSqrtPriceLimitX96",
        type: "uint160",
        indexed: false,
        internalType: "uint160",
      },
      {
        name: "swapBackParams",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "swapBackIntendedOutToken",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MaybifiedSwapResolved",
    inputs: [
      {
        name: "id",
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
        name: "randomness",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "randomnessInBps",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "mintedAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "swapBackState",
        type: "uint8",
        indexed: true,
        internalType: "enum MaybeHook.SwapBackState",
      },
      {
        name: "swapBackResultData",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleAdminChanged",
    inputs: [
      {
        name: "role",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "previousAdminRole",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "newAdminRole",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleGranted",
    inputs: [
      {
        name: "role",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleRevoked",
    inputs: [
      {
        name: "role",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "AccessControlBadConfirmation", inputs: [] },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "neededRole", type: "bytes32", internalType: "bytes32" },
    ],
  },
  { type: "error", name: "CannotMaybifyForZeroTokens", inputs: [] },
  {
    type: "error",
    name: "EthExactInputForTheSwapIsLTEVrfFeeForMaybifying",
    inputs: [
      { name: "ethExactIn", type: "uint256", internalType: "uint256" },
      { name: "vrfFeeInEth", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "HookDataOnlySupportedForExactIn",
    inputs: [],
  },
  {
    type: "error",
    name: "HookDataOnlySupportedForSwappingFromMaybe",
    inputs: [],
  },
  { type: "error", name: "HookNotImplemented", inputs: [] },
  {
    type: "error",
    name: "LPFeeShareCantExceedHundredPercent",
    inputs: [{ name: "lpFeeShare", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "error",
    name: "MaybificationAlreadyInProgressForGivenId",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "error",
    name: "MaybifyingProbabilityCannotExceedMAX_PROBABILITY_IN_BPS",
    inputs: [
      {
        name: "maybifyingProbability",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maxProbability",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NoMaybificationToResolveForGivenId",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
  },
  { type: "error", name: "NotPoolManager", inputs: [] },
  {
    type: "error",
    name: "OnlyVRFWrapperCanFulfill",
    inputs: [
      { name: "have", type: "address", internalType: "address" },
      { name: "want", type: "address", internalType: "address" },
    ],
  },
  { type: "error", name: "PoolMustIncludeEthAndMaybe", inputs: [] },
  {
    type: "error",
    name: "ProtocolFeeCantExceedHundredPercent",
    inputs: [{ name: "protocolFee", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "error",
    name: "VrfNotTimedOutYet",
    inputs: [
      { name: "maybifiedAt", type: "uint256", internalType: "uint256" },
      {
        name: "vrfTimeOutAt",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "currentTimestamp",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "VrfTimedOut",
    inputs: [
      { name: "maybifiedAt", type: "uint256", internalType: "uint256" },
      {
        name: "vrfTimeOutAt",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "currentTimestamp",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
] as const;
