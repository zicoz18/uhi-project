// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary, PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {BaseScript} from "../base/BaseScript.sol";
import {LiquidityHelpers} from "../base/LiquidityHelpers.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract CreatePoolAndAddLiquidityScript is BaseScript, LiquidityHelpers {
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolId;

    /////////////////////////////////////
    // --- Configure These ---
    /////////////////////////////////////

    uint24 lpFee = 100; // 0.01% (100)
    int24 tickSpacing = 60;
    /// 1 ETH = 1_000_000 MAYBE set as the initial price
    uint160 startingPrice = 1000 * 2 ** 96; // Starting price, sqrtPriceX96; floor(sqrt(1_000_000) * 2^96)

    // --- liquidity position configuration --- //
    uint256 public token0Amount = 1e16; // 0.01 ETH
    uint256 public token1Amount = 1e22; // 10_000 MAYBE (equivilant to 0.01 ETH given 1 ETH = 1_000_000 MAYBE pricing)

    // range of the position, must be a multiple of tickSpacing
    int24 tickLower;
    int24 tickUpper;

    /////////////////////////////////////

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0, // ETH
            currency1: currency1, // value set inside BaseScipt, make sure to update value inside there // @TODO: Update after MaybeToken deployment
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hookContract) // value set inside BaseScript, make sure to update value inside there // @TODO: Update after MaybeHook deployment
        });

        string memory json = vm.serializeBytes32(
            "deployment",
            "EthMaybeHookedPoolId",
            PoolId.unwrap(poolKey.toId())
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);
        vm.writeJson(json, "deployments/EthMaybeHookedPoolId.json");

        bytes memory hookData = new bytes(0);

        int24 currentTick = TickMath.getTickAtSqrtPrice(startingPrice);

        tickLower = truncateTickSpacing(
            (currentTick - 750 * tickSpacing),
            tickSpacing
        );
        tickUpper = truncateTickSpacing(
            (currentTick + 750 * tickSpacing),
            tickSpacing
        );

        // Converts token amounts to liquidity units
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startingPrice,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            token0Amount,
            token1Amount
        );

        // slippage limits
        uint256 amount0Max = token0Amount + 1;
        uint256 amount1Max = token1Amount + 1;

        (
            bytes memory actions,
            bytes[] memory mintParams
        ) = _mintLiquidityParams(
                poolKey,
                tickLower,
                tickUpper,
                liquidity,
                amount0Max,
                amount1Max,
                deployerAddress,
                hookData
            );

        // multicall parameters
        bytes[] memory params = new bytes[](2);

        // Initialize Pool
        params[0] = abi.encodeWithSelector(
            positionManager.initializePool.selector,
            poolKey,
            startingPrice,
            hookData
        );

        // Mint Liquidity
        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 3600
        );

        // Since the pool is an ETH pair, native tokens are to be transferred
        uint256 valueToPass = amount0Max;

        vm.startBroadcast();
        tokenApprovals();

        // Multicall to atomically create pool & add liquidity
        positionManager.multicall{value: valueToPass}(params);
        vm.stopBroadcast();
    }
}
