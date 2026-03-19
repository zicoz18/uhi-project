// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {MaybeHook} from "../src/MaybeHook.sol";
import {MaybeRouter} from "../src/MaybeRouter.sol";
import {IMaybeToken} from "../src/interfaces/IMaybeToken.sol";
import {IMaybeHook} from "../src/interfaces/IMaybeHook.sol";
import {MaybeToken} from "../src/MaybeToken.sol";
import {MaybeZQuoter, _BASE as MAYBE_ZQUOTER_BASE, ZROUTER as MAYBE_ZROUTER, WBTC, WETH, DAI, USDC} from "../src/zFiForBase/MaybeZQuoter.sol";
// import {MaybeQuoter} from "../src/MaybeQuoter.sol";
// @TODO: Just import from zFi, no need for zRouter right?
// import {zQuoter, ZROUTER, WBTC, DAI, ZQUOTER_BASE} from "zRouter/src/zQuoter.sol";
// import {zQuoter as zRouterQuoter, ZQUOTER_BASE as ZROUTER_ZQUOTER_BASE, ZROUTER, WBTC, WETH, DAI} from "zRouter/src/zQuoter.sol";
import {IzRouter} from "zRouter/src/IzRouter.sol";
import "../script/base/BaseScript.sol";
import "../script/base/LiquidityHelpers.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IStateView} from "@uniswap/v4-periphery/src/interfaces/IStateView.sol";
import {zQuoter as zFiQuoter, ZQUOTER_BASE as ZFI_ZQUOTER_BASE} from "zFi/src/zQuoter.sol";
import {IVRFV2PlusWrapper} from "chainlink/vrf/dev/interfaces/IVRFV2PlusWrapper.sol";
import {IVRFCoordinatorV2Plus} from "chainlink/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";

library SlippageLib {
    uint256 constant BPS = 10_000;

    error SlippageBpsTooHigh();

    function limit(
        bool exactOut,
        uint256 quoted,
        uint256 bps
    ) internal pure returns (uint256) {
        require(bps < BPS, SlippageBpsTooHigh());
        unchecked {
            if (exactOut) {
                // maxIn = ceil(quotedIn * (1 + bps/BPS))
                return (quoted * (BPS + bps) + BPS - 1) / BPS;
            } else {
                // minOut = floor(quotedOut * (1 - bps/BPS))
                return (quoted * (BPS - bps)) / BPS;
            }
        }
    }
}

/// @dev We used to use these tests to fork mainnet and test our logic but developer experince was awfull as it was taking such a long time to fork the state of the mainnet with RPC and test against it, we ended up deploying to mainnet to test there directly
///
contract RouterTest is Test, LiquidityHelpers {
    uint256 DEADLINE;

    address constant MAYBE_ZQUOTER = 0x70453112cF4dc06b3873D66114844Ee51ff755F1;
    address constant V4_STATE_VIEW = 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71;

    address constant UNI = 0x3f8D39a395874aca1F805b1C2B3418E59Ff321a5;
    address constant RESOLVER = 0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97;
    address constant VITALIK = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045;
    address constant USDC_WHALE = 0x02C79843B9548fC0Cb4B35Bf6840538a73fC3422;
    address constant WETH_WHALE = 0x0629da86aF5a4AE1Ba5e1589b13702558d0Fb056;
    address constant MAYBE_DEPLOYER =
        0x6C366b494d05ff899DA2207d9e314c24A2D0C002;
    address constant vrfCoordinator =
        0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;
    bytes32 vrfKeyHash =
        0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab;
    uint256 vrfSubId =
        60019035958492314978204429142164137687321561039244325044803127454259821938889;
    address vrfWrapper = 0xb0407dbe851f8318bd31404A49e658143C982F23;

    uint256 constant ETH_IN = 0.05 ether;
    uint256 constant USDC_IN = 100e6;

    MaybeHook maybeHook;
    MaybeToken maybeToken;
    MaybeZQuoter maybeZQuoter;
    MaybeRouter maybeRouter;
    address MAYBE;
    PoolKey ethMaybePoolKey;

    // V4 Pool configs
    uint24 lpFee = 3000; // 0.30%
    int24 tickSpacing = 60;
    uint160 startingPrice = 2 ** 96; // Starting price, sqrtPriceX96; floor(sqrt(1) * 2^96)
    // --- liquidity position configuration --- //
    // uint256 public token0Amount = 100e18;
    // uint256 public token1Amount = 100e18;
    // range of the position, must be a multiple of tickSpacing
    int24 tickLower;
    int24 tickUpper;

    //// VRF RELATED

    function _computeRequestId(
        bytes32 keyHash,
        address sender,
        uint256 subId,
        uint64 nonce
    ) internal pure returns (uint256, uint256) {
        uint256 preSeed = uint256(
            keccak256(abi.encode(keyHash, sender, subId, nonce))
        );
        return (uint256(keccak256(abi.encode(keyHash, preSeed))), preSeed);
    }

    //// VRF RELATED END

    function setUp() public {
        // vm.createSelectFork(vm.rpcUrl("base"));
        // vm.createSelectFork(vm.rpcUrl("base"), 42239835);
        // vm.createSelectFork(vm.rpcUrl("main"), 24471388);

        // zrQuoter = new zRouterQuoter();
        // zfQuoter = new zFiQuoter();
        // maybeQuoter = new MaybeQuoter();
        maybeZQuoter = MaybeZQuoter(MAYBE_ZQUOTER);
        DEADLINE = block.timestamp + 20 minutes;

        vm.deal(VITALIK, 1000 ether);
        vm.deal(MAYBE_DEPLOYER, 1000 ether);
        vm.deal(RESOLVER, 1000 ether);
        vm.label(USDC, "USDC");
        vm.label(UNI, "UNI");
        vm.label(MAYBE_ZROUTER, "ZROUTER");
        vm.label(MAYBE_ZQUOTER, "ZQUOTER");
        vm.label(address(MAYBE_ZQUOTER_BASE), "ZQUOTER_BASE");

        // Give Vitalik some USDC and approve the deployed router
        vm.startPrank(USDC_WHALE);
        IERC20(USDC).transfer(VITALIK, 1000e6);
        IERC20(USDC).transfer(MAYBE_DEPLOYER, 1000e6);
        vm.stopPrank();

        vm.label(VITALIK, "Vitalik");
        vm.startPrank(VITALIK);
        IERC20(USDC).approve(MAYBE_ZROUTER, type(uint256).max);
        // IERC20(MAYBE).approve(ZROUTER, type(uint256).max);
        vm.stopPrank();

        deployMaybeSwap();

        vm.startPrank(VITALIK);
        IERC20(USDC).approve(address(maybeRouter), type(uint256).max);
        vm.stopPrank();
    }

    function deployMaybeSwap() internal {
        vm.startPrank(MAYBE_DEPLOYER);

        //// DEPLOY MAYBE TOKEN
        maybeToken = new MaybeToken(MAYBE_DEPLOYER);
        MAYBE = address(maybeToken);
        maybeToken.mint(MAYBE_DEPLOYER, 10000e18);
        maybeToken.mint(VITALIK, 1000e18);

        vm.label(MAYBE, "MaybeToken");

        //// DEPLOY MAYBESWAP'S HOOK
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG |
                Hooks.AFTER_SWAP_FLAG |
                Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );

        uint256 houseEdgeInBps = 100;
        uint256 vrfTimeoutInSeconds = 60;
        uint16 vrfMinimumRequestConfirmation = 0;
        uint256 vrfWrapperOverhead = 13400;
        uint256 vrfCoordinatorNativeOverhead = 128500;
        uint256 vrfCoordinatorNativeOverheadPerWord = 435;
        uint32 vrfCallbackGasLimitEthMaxValue = 2_500_000;
        uint32 vrfCallbackGasLimit = uint32(
            vrfCallbackGasLimitEthMaxValue -
                vrfWrapperOverhead -
                vrfCoordinatorNativeOverhead -
                vrfCoordinatorNativeOverheadPerWord
        );
        vm.label(vrfWrapper, "VRF_WRAPPER");
        vm.label(vrfCoordinator, "VRF_COORDINATOR");

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(
            poolManager,
            maybeToken,
            IzRouter(MAYBE_ZROUTER),
            houseEdgeInBps,
            vrfTimeoutInSeconds,
            vrfMinimumRequestConfirmation,
            vrfCallbackGasLimit,
            vrfWrapper
        );
        (address hookAddress, bytes32 salt) = HookMiner.find(
            MAYBE_DEPLOYER,
            flags,
            type(MaybeHook).creationCode,
            constructorArgs
        );

        // Deploy the hook using CREATE2
        maybeHook = new MaybeHook{salt: salt}(
            poolManager,
            maybeToken,
            IzRouter(MAYBE_ZROUTER),
            houseEdgeInBps,
            vrfTimeoutInSeconds,
            vrfMinimumRequestConfirmation,
            vrfCallbackGasLimit,
            vrfWrapper
        );
        // GIVE MINTING PERMISSION OF MAYBE TO MAYBEHOOK
        maybeToken.grantRole(maybeToken.MINTER_ROLE(), address(maybeHook));

        vm.label(address(maybeHook), "MaybeHook");
        vm.label(address(MAYBE_DEPLOYER), "MaybeDeployer");
        vm.label(WBTC, "WBTC");
        vm.label(WETH, "WETH");

        require(
            address(maybeHook) == hookAddress,
            "DeployHookScript: Hook Address Mismatch"
        );

        //// DEPLOY V4 POOL
        Currency curr0 = Currency.wrap(address(0)); // cur0 is ETH
        Currency curr1 = Currency.wrap(MAYBE); // cur1 is MAYBE

        // uint256 liqTokenAmount = 1000e18;

        // uint256 liqTokenAmount = 100e6;
        uint256 ethAmount = 100e18; // 100 eth
        uint256 maybeAmount = 100e18; // 100 maybe
        // uint256 maybeAmount = 1000e18;

        PoolKey memory poolKey = PoolKey({
            currency0: curr0,
            currency1: curr1,
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: maybeHook
        });

        ethMaybePoolKey = poolKey;

        // DEPLOY MaybeRouter
        maybeRouter = new MaybeRouter(
            poolManager,
            maybeToken,
            IzRouter(MAYBE_ZROUTER),
            IMaybeHook(address(maybeHook)),
            IVRFV2PlusWrapper(vrfWrapper),
            poolKey
        );
        vm.label(address(maybeRouter), "MAYBE_ROUTER");

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
            ethAmount,
            maybeAmount
        );

        // slippage limits
        uint256 amount0Max = ethAmount + 1;
        uint256 amount1Max = maybeAmount + 1;

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
                MAYBE_DEPLOYER,
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

        // If the pool is an ETH pair, native tokens are to be transferred
        uint256 valueToPass = amount0Max;

        IERC20(USDC).approve(address(permit2), type(uint256).max);
        permit2.approve(
            USDC,
            address(positionManager),
            type(uint160).max,
            type(uint48).max
        );

        maybeToken.approve(address(permit2), type(uint256).max);
        permit2.approve(
            MAYBE,
            address(positionManager),
            type(uint160).max,
            type(uint48).max
        );

        // Multicall to atomically create pool & add liquidity
        positionManager.multicall{value: valueToPass}(params);
        vm.stopPrank();

        ///
    }

    function getRequestId() public returns (uint256 requestId) {
        // NOTE: There is this problem, where we want to know the requestId of the VRF request, yet VRF contracts are not exposing a method to calculate such a thing. I guess we could do some things with recording event logs but it failed for now, so what we ended up going with is...
        //
        //    struct ConsumerConfig {
        //        bool active;
        //        uint64 nonce;
        //        uint64 pendingReqCount;
        //    }
        //
        // Compute the request id here, well to do that, we do need the `ConsumerConfig.nonce` for `_computeRequestId()` func rest of them are preknown given environment, but this one changes based on block number and we cant really read it via a view func
        // So, what we gotta do is, compute the slot for ConsumerConfig which is a `mapping(address => mapping(uint256 => ConsumerConfig)) /* consumerAddress */ /* subId */ /* consumerConfig */internal s_consumers;` an embedded mapping
        // We know that this mapping's slot index is 4 given SubscriptionAPI storage layout and extended contracts' storage layouts
        // After that, all we gotta do is, compute slots given keys
        // Since first key is consumerAddress, its vrfWrapper so keccak the encoded version to find the slot for next mapping
        // Since this is the last mapping just use the key with prev storage slot to compute storage slot for where data is stored
        // Therefore, we encode with vrfSubId and receive the slot number for storing `s_consumers[consumer][subId]`
        uint256 s_consumers_slot = 4; // Manually understood it by inspecting VRFCoordinator contract (would be way better if I knew a tool that does this)
        uint256 keySlotForConsumerConfigs = uint256(
            keccak256(abi.encode(vrfWrapper, s_consumers_slot))
        );
        uint256 consumerConfigSlot = uint256(
            keccak256(abi.encode(vrfSubId, keySlotForConsumerConfigs))
        );
        // After successfully finding the storage slot to load, we do load it, but we gotta be careful because ConsumerConfig is stored in a single slot because its packed and it gets packed to the right of the bytes and not left as it would be in memory
        // so, 1 bytes from the right is `bool active` and then next 4 bytes would represent `uint64 nonce` therefore, we shift right by 1 byte (8 bits) and mask with 0xffffffff to get last 4 bytes
        bytes32 loadedValueForConsumerConfigSlot = vm.load(
            vrfCoordinator,
            bytes32(consumerConfigSlot)
        );
        uint64 nonce = uint64(
            uint256(
                uint256(loadedValueForConsumerConfigSlot >> 8) &
                    uint256(0xFFFFFFFF)
            )
        );
        (requestId, ) = _computeRequestId(
            vrfKeyHash,
            vrfWrapper,
            vrfSubId,
            nonce // 1735 given ethereum mainnet block number is 24471149
        );
    }

    function testSwapFromTokenXToEthToMaybeAndRegisterMaybifyWithNoSwapBack()
        public
    {
        // Fund Vitalik with WBTC
        address WBTC_WHALE = 0xE4caBCb27575E01343EbFa8dE82bFE5fc8908aEd;
        vm.label(WBTC_WHALE, "WBTC_WHALE");
        vm.prank(WBTC_WHALE);
        IERC20(WBTC).transfer(VITALIK, 1e8);
        vm.prank(VITALIK);
        IERC20(WBTC).approve(address(maybeRouter), type(uint256).max);
        vm.prank(VITALIK);
        uint256 swapAmountExactIn = 100_000; // 0.001 WBTC
        uint256 betProbabilityInBps = 5000;
        // we want to receive MAYBE directly so swapBackOnlyToEth is false and swapBackOnlyToEth is empty
        bool swapBackOnlyToEth = false;
        bytes memory swapBackParams = "";
        uint256 slippageInBpsForSwappingFromEthToMaybe = 100;
        bool zeroForOneForSwappingFromEthToMaybe = true;
        (
            MaybeZQuoter.Quote memory a,
            MaybeZQuoter.Quote memory b,
            bytes[] memory calls,
            bytes memory multicall,
            uint256 msgValue
        ) = maybeZQuoter.buildBestSwapViaETHMulticall(
                address(maybeRouter),
                VITALIK,
                false,
                WBTC,
                address(0),
                swapAmountExactIn,
                9999,
                DEADLINE,
                0,
                0,
                address(0),
                false
            );

        // WBTC
        uint256 wbtcVitalikBalanceBefore = IERC20(WBTC).balanceOf(VITALIK);
        uint256 wbtcZRouterBalanceBefore = IERC20(WBTC).balanceOf(
            MAYBE_ZROUTER
        );
        uint256 wbtcMaybeRouterBalanceBefore = IERC20(WBTC).balanceOf(
            address(maybeRouter)
        );
        // ETH
        uint256 ethVitalikBalanceBefore = VITALIK.balance;
        uint256 ethZRouterBalanceBefore = MAYBE_ZROUTER.balance;
        uint256 ethMaybeRouterBalanceBefore = address(maybeRouter).balance;
        // MAYBE
        uint256 maybeVitalikBalanceBefore = maybeToken.balanceOf(VITALIK);
        uint256 maybeZRouterBalanceBefore = maybeToken.balanceOf(MAYBE_ZROUTER);
        uint256 maybeMaybeRouterBalanceBefore = maybeToken.balanceOf(
            address(maybeRouter)
        );
        // Read sqrt price for ETH/MAYBE to get the current price and add slippage value to that price to be able to have slippage protection
        (uint160 _sqrtPriceX96, , , ) = IStateView(V4_STATE_VIEW).getSlot0(
            ethMaybePoolKey.toId()
        );
        // since one tick difference represents 0.01% change in price, what we can do is, increase or decrease the tick value by the slippage bps (so if user wants 100 bps of slippage, we will increase or decrease tick via 100 tick) and get the price for that tick to enforce slippage using sqrtPrice limit values
        // @TODO: I guess this sqrtPriceLimit does not have to valid for tick spacing value right?
        int24 currentTick = TickMath.getTickAtSqrtPrice(_sqrtPriceX96);
        int24 tickDelta = zeroForOneForSwappingFromEthToMaybe
            ? -int24(int256(slippageInBpsForSwappingFromEthToMaybe))
            : int24(int256(slippageInBpsForSwappingFromEthToMaybe));
        int24 limitTick = currentTick + tickDelta;
        uint160 sqrtPriceLimitForSlippageForSwappingFromEthToMaybe = TickMath
            .getSqrtPriceAtTick(limitTick);

        vm.startPrank(VITALIK);
        // (bool ok, ) = ZROUTER.call{value: 0}(callData);
        // bytes memory hookData = "1";
        bytes memory hookData = abi.encode(
            MaybeHook.MaybifyParams({
                probabilityInBps: betProbabilityInBps,
                swapper: VITALIK,
                swapBackOnlyToEth: swapBackOnlyToEth,
                swapBackSqrtPriceLimitX96: sqrtPriceLimitForSlippageForSwappingFromEthToMaybe,
                swapBackParams: swapBackParams
            })
        );
        maybeRouter.maybeSwap(
            WBTC,
            swapAmountExactIn,
            msgValue,
            multicall,
            sqrtPriceLimitForSlippageForSwappingFromEthToMaybe,
            betProbabilityInBps,
            swapBackOnlyToEth,
            0, // @NOTE: Since we are not swapping back, this is not actually used
            swapBackParams
        );
        // WBTC
        uint256 wbtcVitalikBalanceAfter = IERC20(WBTC).balanceOf(VITALIK);
        uint256 wbtcZRouterBalanceAfter = IERC20(WBTC).balanceOf(MAYBE_ZROUTER);
        uint256 wbtcMaybeRouterBalanceAfter = IERC20(WBTC).balanceOf(
            address(maybeRouter)
        );
        // ETH
        uint256 ethVitalikBalanceAfter = VITALIK.balance;
        uint256 ethZRouterBalanceAfter = MAYBE_ZROUTER.balance;
        uint256 ethMaybeRouterBalanceAfter = address(maybeRouter).balance;
        // MAYBE
        uint256 maybeVitalikBalanceAfter = maybeToken.balanceOf(VITALIK);
        uint256 maybeZRouterBalanceAfter = maybeToken.balanceOf(MAYBE_ZROUTER);
        uint256 maybeMaybeRouterBalanceAfter = maybeToken.balanceOf(
            address(maybeRouter)
        );

        // WBTC
        assertGt(
            wbtcVitalikBalanceBefore,
            wbtcVitalikBalanceAfter,
            "vitalik should spend WBTC"
        );
        assertEq(
            wbtcZRouterBalanceBefore,
            wbtcZRouterBalanceAfter,
            "zrouter WBTC balance should not change"
        );
        assertEq(
            wbtcMaybeRouterBalanceBefore,
            wbtcMaybeRouterBalanceAfter,
            "maybeRouter WBTC balance should not change"
        );
        // ETH
        assertEq(
            ethZRouterBalanceBefore,
            ethZRouterBalanceAfter,
            "zrouter ETH balance should not change"
        );
        assertEq(
            ethMaybeRouterBalanceBefore,
            ethMaybeRouterBalanceAfter,
            "maybeRouter ETH balance should not change"
        );
        // MAYBE
        assertEq(
            maybeVitalikBalanceBefore,
            maybeVitalikBalanceAfter,
            "vitalik MAYBE balance should not change"
        );
        assertEq(
            maybeZRouterBalanceBefore,
            maybeZRouterBalanceAfter,
            "zrouter MAYBE balance should not change"
        );
        assertEq(
            maybeMaybeRouterBalanceBefore,
            maybeMaybeRouterBalanceAfter,
            "maybeRouter MAYBE balance should not change"
        );
        uint256 requestId = getRequestId();
        MaybeHook.MaybifySwap memory bet = maybeHook.getMaybifySwap(requestId);
        // MaybeHook.MaybifySwap memory bet = maybeHook.getMaybifySwap(0);
        assertNotEq(bet.maybifyAmount, 0, "bet exists for non zero amount");
        assertEq(
            bet.currentHouseEdgeInBps,
            maybeHook.houseEdgeInBps(),
            "bet has house edge as configured"
        );
        assertEq(
            bet.maybifyParams.swapper,
            VITALIK,
            "bet is registered on behalf of vitalik"
        );
        assertEq(
            bet.maybifyParams.probabilityInBps,
            betProbabilityInBps,
            "bet is registered with correct probability"
        );
        assertEq(
            bet.maybifyParams.swapBackParams,
            swapBackParams,
            "bet contains swap back params"
        );

        uint256 payoutMultiplierInWad = ((maybeHook.MAX_PROBABILITY_IN_BPS() -
            bet.currentHouseEdgeInBps) * 1e18) /
            bet.maybifyParams.probabilityInBps;
        uint256 payoutAmount = FullMath.mulDiv(
            payoutMultiplierInWad,
            bet.maybifyAmount,
            1e18
        );
        uint256 expectedMaybeMintAmount = payoutAmount;

        uint256 vitalikMaybeBalanceBeforeResolve = maybeToken.balanceOf(
            VITALIK
        );

        // Set the block time to be 1 seconds before it gets timed out for VRF
        vm.warp(bet.maybifiedAt + maybeHook.vrfTimeout() - 1);
        // Since swapBackParams are empty, it will mint
        vm.stopPrank();
        vm.prank(address(maybeHook.i_vrfV2PlusWrapper()));
        maybeHook.rawFulfillRandomWords(requestId, new uint256[](1)); // @TODO: resolving for requestId with random number as 0
        // vm.stopPrank();

        uint256 vitalikMaybeBalanceAfterResolve = maybeToken.balanceOf(VITALIK);
        assertEq(
            vitalikMaybeBalanceAfterResolve - vitalikMaybeBalanceBeforeResolve,
            expectedMaybeMintAmount,
            "vitalik should receive calculated amount of MAYBE after resolvement"
        );
        // @TODO: Also check the case for swapiing back MAYBE to ETH or something in another test
    }

    function testSwapFromTokenXToEthToMaybeAndRegisterMaybifyWithSwapBackFromMaybeToEthToTokenY()
        public
    {
        // Fund Vitalik with WBTC
        address WBTC_WHALE = 0x652356478073bA1D38b310850446d0A4C3Cad4BD;
        vm.label(WBTC_WHALE, "WBTC_WHALE");
        vm.prank(WBTC_WHALE);
        IERC20(WBTC).transfer(VITALIK, 1e8);
        vm.prank(VITALIK);
        IERC20(WBTC).approve(address(maybeRouter), type(uint256).max);
        uint256 swapAmountExactIn = 100_000; // 0.001 WBTC
        uint256 betProbabilityInBps = 5000;
        uint256 slippageInBps = 100;
        bool swapBackOnlyToEth = false;
        uint256 swapBackSlippageInBps = 200; // @NOTE: Assuming swap back will occur further in future than the initial swap, swapBackSlippage probably should be bigger than initial swap's slippage
        bytes memory swapBackParams = ""; // TODO: ???????? how can we have this before knowing the exact MAYBE amount to swap for?
        ////// GET sqrtPriceLimit for swapping from ETH to MAYBE
        uint256 slippageInBpsForSwappingFromEthToMaybe = 100;
        bool zeroForOneForSwappingFromEthToMaybe = true;
        // Read sqrt price for ETH/MAYBE to get the current price and add slippage value to that price to be able to have slippage protection
        (
            uint160 _sqrtPriceX96,
            int24 _tick,
            uint24 _protocolFee,
            uint24 _lpFee
        ) = IStateView(V4_STATE_VIEW).getSlot0(ethMaybePoolKey.toId());
        int24 currentTick = TickMath.getTickAtSqrtPrice(_sqrtPriceX96);
        uint160 sqrtPriceLimitForSlippageForSwappingFromEthToMaybe;
        {
            // since one tick difference represents 0.01% change in price, what we can do is, increase or decrease the tick value by the slippage bps (so if user wants 100 bps of slippage, we will increase or decrease tick via 100 tick) and get the price for that tick to enforce slippage using sqrtPrice limit values
            // @TODO: I guess this sqrtPriceLimit does not have to valid for tick spacing value right?
            int24 tickDelta = zeroForOneForSwappingFromEthToMaybe
                ? -int24(int256(slippageInBpsForSwappingFromEthToMaybe))
                : int24(int256(slippageInBpsForSwappingFromEthToMaybe));
            int24 limitTick = currentTick + tickDelta;
            sqrtPriceLimitForSlippageForSwappingFromEthToMaybe = TickMath
                .getSqrtPriceAtTick(limitTick);
        }
        ////// GET sqrtPriceLimit for swapping back from MAYBE to ETH
        uint256 slippageInBpsForSwappingFromMaybetoEth = 250;
        bool zeroForOneForSwappingFromMaybeToEth = false;
        uint160 sqrtPriceLimitForSlippageForSwappingFromMaybeToEth;
        {
            int24 tickDelta = zeroForOneForSwappingFromMaybeToEth
                ? -int24(int256(slippageInBpsForSwappingFromMaybetoEth))
                : int24(int256(slippageInBpsForSwappingFromMaybetoEth));
            int24 limitTick = currentTick + tickDelta;
            sqrtPriceLimitForSlippageForSwappingFromMaybeToEth = TickMath
                .getSqrtPriceAtTick(limitTick);
        }
        //

        uint256 vitalikUniBalanceBefore = IERC20(UNI).balanceOf(VITALIK);
        uint256 vitalikWbtcBalanceBefore = IERC20(WBTC).balanceOf(VITALIK);
        // @NOTE: Trying to find out minimum ETH amount to be recevied
        (
            MaybeZQuoter.Quote memory a,
            MaybeZQuoter.Quote memory b,
            bytes[] memory calls,
            bytes memory multicall,
            uint256 msgValue
        ) = maybeZQuoter.buildBestSwapViaETHMulticall(
                address(maybeRouter),
                VITALIK,
                false,
                WBTC,
                address(0),
                swapAmountExactIn,
                slippageInBps,
                DEADLINE,
                0,
                0,
                address(0),
                false
            );
        // @TODO: Gotta return the extra MAYBEs back to user if there has been more than min value
        uint256 minMaybePayoutAmount;
        {
            // quote A represents swapping from token X to token MID
            // quote B represents swapping from token MID to token out
            // BUT, thats the case if the best case is for a multi hop swap, so if best case is a single hop, quote A will represent it directly
            uint256 expectedEthAmountOut = b.amountOut == 0
                ? a.amountOut
                : b.amountOut;
            uint256 minExpectedEthAmountOut = SlippageLib.limit(
                false,
                expectedEthAmountOut,
                slippageInBps
            );

            // Calculate expected VRF fee
            uint256 expectedVRFFeeInEth = IVRFV2PlusWrapper(vrfWrapper)
                .estimateRequestPriceNative(
                    maybeHook.vrfCallbackGasLimit(),
                    1,
                    tx.gasprice
                );
            assertNotEq(tx.gasprice, expectedVRFFeeInEth);
            // @TODO: Subtract VRF fee from received ETH to assume for ETH input for ETH/MAYBE swap
            uint256 minEthAmountAfterVrfFee = minExpectedEthAmountOut -
                expectedVRFFeeInEth;
            // @NOTE: Trying to find out minimum MAYBE amount to be recevied based on minimum ETH amount
            (
                uint256 spentEth,
                uint256 expectedMaybeAmountOut
            ) = MAYBE_ZQUOTER_BASE.quoteV4(
                    false,
                    address(0),
                    MAYBE,
                    lpFee,
                    tickSpacing,
                    address(maybeHook),
                    minEthAmountAfterVrfFee
                );
            uint256 minMaybeAmountOut = SlippageLib.limit(
                false,
                expectedMaybeAmountOut,
                slippageInBps
            );
            // @NOTE: Okay we now know the minimum MAYBE amount that will be used to maybify for the user. Since we also know the bet params like, the probablility and therefore the payout multiplier. We could also derive the minimum MAYBE payout for the user
            uint256 payoutMultiplierInWad = ((maybeHook
                .MAX_PROBABILITY_IN_BPS() - maybeHook.houseEdgeInBps()) *
                1e18) / betProbabilityInBps;
            minMaybePayoutAmount = FullMath.mulDiv(
                payoutMultiplierInWad,
                minMaybeAmountOut,
                1e18
            );
        }
        // @TODO: Well there exists a problem now, because we will not be directly swapping all the ETH to MAYBE, instead we will pay for VRF with some part of the ETH so, we gotta recalculate the expected MAYBE output

        // @NOTE: Okay we have calculated the min MAYBE payout that will be minted. Lets imagine the worst case and assume that user will be getting this amount (it could technically be higher and if thats the case, we should probably send the remainder to the user or something)
        // @NOTE: Since we know the exact MAYBE token amount we want to swap for, now what we can do is, get a quote for swapping MAYBE to token Y
        // @NOTE: I have taken a look at zQuoter but looks like V4 hooked is only supported if input token is ETH, yet thats not the case for us. So, what we will be doing is, we will manually assume that user will be swapping out of MAYBE to USDC using our v4 hook and we will just get a quote for that now and add slippage
        (uint256 maybeAmountIn, uint256 ethAmountOut) = MAYBE_ZQUOTER_BASE
            .quoteV4(
                false,
                MAYBE,
                address(0),
                lpFee,
                tickSpacing,
                address(maybeHook),
                minMaybePayoutAmount
            );
        // @TODO: Gotta return the extra USDCs back to user if there has been more than min value
        uint256 minEthAmountOut = SlippageLib.limit(
            false,
            ethAmountOut,
            swapBackSlippageInBps
        );

        // swapBackParams = swapBackMulticall;
        // @TODO: Well, this is kinda great like, we got the quote and the muticall calldata for swapping `minUsdcAmountOut` amount of USDC, but ideally we should be calling it with the whole balance of zRouter, as we are not actually sure about the outputted USDC amount
        // @TODO: So, we gotta update the multicall calldata to work for swapAmount being 0
        // @TODO: Okay, I have written MaybeQuoterV2, which basically encodes the multicall calldatas with swap amount being 0 so that I dont have to decode the multicall's mysterious calldata and replace the swap amount to be 0
        bool omitSwapAmountForBuildingCalldata = true;
        (
            MaybeZQuoter.Quote memory swapBackQa,
            MaybeZQuoter.Quote memory swapBackQb,
            bytes[] memory swapBackCalls,
            bytes memory swapBackMulticall,
            uint256 swapBackMsgValue
        ) = maybeZQuoter.buildBestSwapViaETHMulticall(
                VITALIK,
                VITALIK,
                false,
                address(0),
                UNI,
                minEthAmountOut,
                swapBackSlippageInBps,
                DEADLINE,
                0,
                0,
                address(0),
                omitSwapAmountForBuildingCalldata
            );
        swapBackParams = swapBackMulticall;

        vm.startPrank(VITALIK);
        bytes memory hookData = abi.encode(
            MaybeHook.MaybifyParams({
                swapper: VITALIK,
                probabilityInBps: betProbabilityInBps,
                swapBackOnlyToEth: swapBackOnlyToEth,
                swapBackSqrtPriceLimitX96: sqrtPriceLimitForSlippageForSwappingFromMaybeToEth,
                swapBackParams: swapBackParams
            })
        );
        maybeRouter.maybeSwap(
            WBTC,
            swapAmountExactIn,
            msgValue,
            multicall,
            sqrtPriceLimitForSlippageForSwappingFromEthToMaybe,
            betProbabilityInBps,
            swapBackOnlyToEth,
            sqrtPriceLimitForSlippageForSwappingFromMaybeToEth,
            swapBackParams
        );

        uint256 requestId = getRequestId();
        MaybeHook.MaybifySwap memory bet = maybeHook.getMaybifySwap(requestId);
        assertNotEq(bet.maybifyAmount, 0, "bet exists for non zero amount");
        assertEq(
            bet.currentHouseEdgeInBps,
            maybeHook.houseEdgeInBps(),
            "bet has house edge as configured"
        );
        assertEq(
            bet.maybifyParams.swapper,
            VITALIK,
            "bet is registered on behalf of vitalik"
        );
        assertEq(
            bet.maybifyParams.probabilityInBps,
            betProbabilityInBps,
            "bet is registered with correct probability"
        );
        assertEq(
            bet.maybifyParams.swapBackParams,
            swapBackParams,
            "bet contains swap back params"
        );

        uint256 payoutMultiplierInWad = ((maybeHook.MAX_PROBABILITY_IN_BPS() -
            bet.currentHouseEdgeInBps) * 1e18) /
            bet.maybifyParams.probabilityInBps;
        uint256 payoutAmount = FullMath.mulDiv(
            payoutMultiplierInWad,
            bet.maybifyAmount,
            1e18
        );
        uint256 expectedMaybeMintAmount = payoutAmount;

        uint256 vitalikMaybeBalanceBeforeResolve = maybeToken.balanceOf(
            VITALIK
        );

        // Set the block time to be 1 seconds before it gets timed out for VRF
        vm.warp(bet.maybifiedAt + maybeHook.vrfTimeout() - 1);
        vm.stopPrank();
        vm.prank(address(maybeHook.i_vrfV2PlusWrapper()));
        maybeHook.rawFulfillRandomWords(requestId, new uint256[](1)); // @TODO: resolving for requestId with random number as 0

        {
            uint256 ethZRouterBalanceAfterResolvement = MAYBE_ZROUTER.balance;
            assertEq(
                ethZRouterBalanceAfterResolvement,
                0,
                "zRouter should not end up with excess ETH"
            );
        }
        {
            uint256 ethMaybeRouterBalanceAfterResolvement = address(maybeRouter)
                .balance;
            assertEq(
                ethMaybeRouterBalanceAfterResolvement,
                0,
                "maybeRouter should not end up with excess ETH"
            );
        }
        {
            uint256 uniVitalikBalanceAfterResolvement = IERC20(UNI).balanceOf(
                VITALIK
            );

            assertGt(
                uniVitalikBalanceAfterResolvement,
                vitalikUniBalanceBefore,
                "vitalik should receive UNI"
            );
        }
        {
            uint256 wbtcVitalikBalanceAfterResolvement = IERC20(WBTC).balanceOf(
                VITALIK
            );
            assertEq(
                wbtcVitalikBalanceAfterResolvement,
                vitalikWbtcBalanceBefore - swapAmountExactIn,
                "vitalik should spend the exact input amount of WBTC"
            );
        }

        //  HELL YEAH, I WAS ABLE TO START FROM WBTC
        //  SWAP SOMEHOW TO ETH
        //  SWAP ETH TO MAYBE AND TRIGGER A BET
        //  WHEN BET GETS RESOLVED
        //  MAYBE GETS SWAPPED TO ETH
        //  ETH GETS SWAPPED TO UNI

        // 1ST TX: BTC -> ??? -> ETH -> MAYBE (??? SWAPPING IS SUPPORTED BY ZQUOTER'S OPTIMIZED SWAP)
        // 2ND TX: MAYBE -> ETH -> ??? -> UNI (??? SWAPPING IS SUPPORTED BY ZQUOTER'S OPTIMIZED SWAP)
    }

    receive() external payable {}
}
