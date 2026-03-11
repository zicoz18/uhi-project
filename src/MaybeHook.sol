// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IMaybeToken} from "./interfaces/IMaybeToken.sol";
import {IMaybeHook} from "./interfaces/IMaybeHook.sol";

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IzRouter} from "zRouter/src/IzRouter.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {VRFV2PlusWrapperConsumerBase} from "chainlink/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";

contract MaybeHook is
    BaseHook,
    AccessControlEnumerable,
    VRFV2PlusWrapperConsumerBase,
    IMaybeHook
{
    using CurrencySettler for Currency;
    uint256 public constant HUNDRED_IN_BPS = 100_00;
    uint256 public constant MAX_PROBABILITY_IN_BPS = HUNDRED_IN_BPS;
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    IMaybeToken public immutable maybeToken;
    uint256 public immutable vrfTimeout;
    uint16 public immutable vrfMinimumRequestConfirmations;

    PoolKey public poolKey;
    IzRouter public zRouter;
    uint256 public protocolFeeInBps;
    uint32 public vrfCallbackGasLimit;

    // Inside afterSwap() we are getting the maybify id yet we cant return that value to external contracts like routers
    // Yet external routers like MaybeRouter might want to make use of that id to match their info with the maybifying
    // As a result, we have this latestRegisteredMaybifyId which can be called right after registering a maybification via swapping to receive the corresponding maybify id
    // Currently, MaybeRouter is calling poolManager.swap() causing to registering a maybify and then calls latestRegisteredMaybifyId() to get the id of their maybify and they match it with their swapping info related to maybifying
    uint256 public latestRegisteredMaybifyId;

    mapping(uint256 => MaybifySwap) public requestIdToMaybifySwap;

    // This struct is the hookData that indicates how to Maybify the swap
    struct MaybifyParams {
        uint256 probabilityInBps;
        address swapper;
        bool swapBackOnlyToEth;
        uint160 swapBackSqrtPriceLimitX96; // used for slippage protection when swapping back from MAYBE to ETH
        bytes swapBackParams;
        address swapBackIntendedOutToken; // this is only used as a helper info inside _swapBack() to check user's balance of this token and encode the token increase for MaybifiedSwapResolved event. Actual swaps will be performed via `swapBackParams` and might differ from `swapBackIntendedOutToken` address in such a case, `swapBackResultData` param of MaybifiedSwapResolved will not be helpful. Yet, if frontend is using `swapBackIntendedOutToken` value correctly, they will be able to understand the result of the swap back easily with a single event
    }

    // This struct adds extra info to the maybify params to handle the resolvement
    struct MaybifySwap {
        MaybifyParams maybifyParams;
        uint256 maybifyAmount;
        uint256 maybifiedAt;
        uint256 currentProtocolFeeInBps;
    }

    enum SwapBackState {
        NOTHING_TO_SWAP_BACK,
        NEWLY_MINTED_MAYBE,
        SWAP_FROM_MAYBE_TO_ETH_NOT_FULLY_CONSUMED,
        SWAPPED_BACK_TO_ETH,
        SWAP_FROM_ETH_TO_TOKEN_Y_FAILED,
        SWAPPED_BACK_TO_TOKEN_Y
    }

    event MaybifiedSwapRegistered(
        uint256 indexed id,
        address indexed swapper,
        uint256 probabilityInBps,
        uint256 burntAmount,
        uint256 timestamp,
        uint256 protocolFeeInBps,
        bool swapBackOnlyToEth,
        uint160 swapBackSqrtPriceLimitX96,
        bytes swapBackParams,
        address swapBackIntendedOutToken
    );

    event MaybifiedSwapResolved(
        uint256 indexed id,
        address indexed swapper,
        uint256 randomness,
        uint256 randomnessInBps,
        uint256 mintedAmount,
        uint256 timestamp,
        SwapBackState indexed swapBackState,
        bytes swapBackResultData
    );

    error ProtocolFeeCantExceedHundredPercent(uint256 protocolFee);
    error PoolMustIncludeEthAndMaybe();
    error HookDataOnlySupportedForSwappingFromMaybe();
    error HookDataOnlySupportedForExactIn();
    error EthExactInputForTheSwapIsLTEVrfFeeForMaybifying(
        uint256 ethExactIn,
        uint256 vrfFeeInEth
    );
    error MaybifyingProbabilityCannotExceedMAX_PROBABILITY_IN_BPS(
        uint256 maybifyingProbability,
        uint256 maxProbability
    );
    error CannotMaybifyForZeroTokens();
    error MaybificationAlreadyInProgressForGivenId(uint256 id);
    error VrfTimedOut(
        uint256 maybifiedAt,
        uint256 vrfTimeOutAt,
        uint256 currentTimestamp
    );
    error VrfNotTimedOutYet(
        uint256 maybifiedAt,
        uint256 vrfTimeOutAt,
        uint256 currentTimestamp
    );
    error NoMaybificationToResolveForGivenId(uint256 id);

    constructor(
        address _owner,
        IPoolManager _poolManager,
        IMaybeToken _maybeToken,
        IzRouter _zRouter,
        uint256 _protocolFeeInBps,
        uint256 _vrfTimeout,
        uint16 _vrfMinimumRequestConfirmations,
        uint32 _vrfCallbackGasLimit,
        address _vrfV2PlusWrapper
    ) BaseHook(_poolManager) VRFV2PlusWrapperConsumerBase(_vrfV2PlusWrapper) {
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(RESOLVER_ROLE, _owner);
        maybeToken = _maybeToken;
        zRouter = _zRouter;
        if (_protocolFeeInBps > HUNDRED_IN_BPS)
            revert ProtocolFeeCantExceedHundredPercent(_protocolFeeInBps);
        protocolFeeInBps = _protocolFeeInBps;
        vrfTimeout = _vrfTimeout;
        vrfMinimumRequestConfirmations = _vrfMinimumRequestConfirmations;
        vrfCallbackGasLimit = _vrfCallbackGasLimit;
    }

    // functionality to update protocol fee, can only be called by owner
    function setProtocolFeeInBps(
        uint256 _protocolFeeInBps
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_protocolFeeInBps > HUNDRED_IN_BPS)
            revert ProtocolFeeCantExceedHundredPercent(_protocolFeeInBps); // protocol fee cannot exceed %100.00
        protocolFeeInBps = _protocolFeeInBps;
    }

    // functionality to update gas limit for vrf, can only be called by owner
    function setVRFCallbackGasLimit(
        uint32 _vrfCallbackGasLimit
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        vrfCallbackGasLimit = _vrfCallbackGasLimit;
    }

    // functionality to update zRouter, in case it gets updated or something. Like if a vuln has been found for zRouter we would need to update it
    function updateZRouter(
        IzRouter _zRouter
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        zRouter = _zRouter;
    }

    function getMaybifySwap(
        uint256 requestId
    ) public view returns (MaybifySwap memory) {
        return requestIdToMaybifySwap[requestId];
    }

    // Only need: beforeInitialize + afterSwap (+ afterSwapReturnDelta)
    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: true,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    // Require the pool to be MAYBE/ETH
    function _beforeInitialize(
        address,
        PoolKey calldata key,
        uint160
    ) internal override returns (bytes4) {
        // We are not expecting to have a lot of pools against MAYBE like the frontend should support hoping across multiple pools to find a path to maximize output
        // We came to this conculison after considering potential liquidity fragmentation
        // Rather than having MAYBE paired with a lot of tokens and fragmenting the liquidity across them, we plan to fund the main MAYBE/ETH that has this pool and allow better prices for swapping
        if (!_isEth(key.currency0) || !_isMaybe(key.currency1))
            revert PoolMustIncludeEthAndMaybe();
        poolKey = key;
        return BaseHook.beforeInitialize.selector;
    }

    // Since we know this is a ETH/MAYBE pool and we only register a maybify when swap is from ETH to MAYBE, we could charge the VRF request fee inside beforeSwap hook to decrease that ETH amount from being swapped for MAYBE
    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // Not opted in to maybify => do nothing
        if (hookData.length == 0)
            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                0
            );

        // Only care when the OUTPUT is MAYBE (since pool is required to be against ETH, we are sure that token0 is ETH and token1 is MAYBE)
        if (!params.zeroForOne) {
            // user passed hookData but they are not swapping into MAYBE, revert
            revert HookDataOnlySupportedForSwappingFromMaybe();
        }
        // From here on: output is MAYBE and user opted-in.

        // We only implement maybify for exactInput swaps (amountSpecified < 0)
        // From here on: output is MAYBE and user opted-in.
        if (params.amountSpecified >= 0)
            revert HookDataOnlySupportedForExactIn();

        // Calculate VRF fee
        uint256 vrfFeeInEth = i_vrfV2PlusWrapper.calculateRequestPriceNative(
            vrfCallbackGasLimit,
            1
        );
        // Make sure that swap amount is gt vrf fee
        if (uint256(-params.amountSpecified) <= vrfFeeInEth) {
            revert EthExactInputForTheSwapIsLTEVrfFeeForMaybifying(
                uint256(-params.amountSpecified),
                vrfFeeInEth
            );
        }
        // Take ETH amount to the hook to pay for VRF in afterSwap
        key.currency0.take(poolManager, address(this), vrfFeeInEth, false);
        // Decrease the swap amount of ETH by this VRF fee amount
        return (
            BaseHook.beforeSwap.selector,
            toBeforeSwapDelta(int128(int(vrfFeeInEth)), 0),
            0
        );
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128 hookDeltaUnspecified) {
        // Not opted in => do nothing
        if (hookData.length == 0) return (BaseHook.afterSwap.selector, 0);

        // Only care when the OUTPUT is MAYBE (since pool is required to be against ETH, we are sure that token0 is ETH and token1 is MAYBE)
        if (!params.zeroForOne) {
            // user passed hookData but they are not swapping into MAYBE, revert
            revert HookDataOnlySupportedForSwappingFromMaybe();
        }
        // From here on: output is MAYBE and user opted-in.

        // We only implement maybify for exactInput swaps (amountSpecified < 0)
        // If they try exactOutput INTO MAYBE while opted-in, revert.
        if (params.amountSpecified >= 0)
            revert HookDataOnlySupportedForExactIn();

        // In exactInput, output is the unspecified currency, and the output delta is positive.
        int128 maybeDelta = delta.amount1(); // since we know currency0 has to be ETH and currency1 has to be MAYBE. We can just get delta.amount1()

        if (maybeDelta <= 0) return (BaseHook.afterSwap.selector, 0);

        // Return delta is in unspecified currency (MAYBE). Positive => hook is owed/takes it.
        hookDeltaUnspecified = maybeDelta;

        // Pull the MAYBE into the hook
        key.currency1.take(
            poolManager,
            address(this),
            uint256(uint128(maybeDelta)),
            false
        );

        // maybify
        _maybify(
            uint256(uint128(maybeDelta)),
            abi.decode(hookData, (MaybifyParams))
        );

        return (BaseHook.afterSwap.selector, hookDeltaUnspecified);
    }

    function _maybify(
        uint256 maybifyAmount,
        MaybifyParams memory maybifyParams
    ) internal {
        // NOTE: Validate maybify params (like make sure that probability and payouts are valid)
        if (maybifyParams.probabilityInBps > MAX_PROBABILITY_IN_BPS) {
            revert MaybifyingProbabilityCannotExceedMAX_PROBABILITY_IN_BPS(
                maybifyParams.probabilityInBps,
                MAX_PROBABILITY_IN_BPS
            );
        }
        // NOTE: Cannot maybify for 0 tokens
        if (maybifyAmount == 0) revert CannotMaybifyForZeroTokens();
        // burns the tokens directly from this hook contract as they are taken inside afterSwap
        maybeToken.burn(maybifyAmount);
        // NOTE: request randomness, requires the ETH to be sent when calling, we are able to do that because this hook contract takes in the ETH inside beforeSwap
        (uint256 maybifyId /* uint256 vrfFeeInEth */, ) = _requestRandomness();
        // latestRegisteredMaybifyId value is set so that external contract can get the maybify id for their swap cuz we cant return value inside afterSwap()
        latestRegisteredMaybifyId = maybifyId;
        // if maybifyId is already in use for another maybify, revert
        if (requestIdToMaybifySwap[maybifyId].maybifyAmount != 0) {
            revert MaybificationAlreadyInProgressForGivenId(maybifyId);
        }
        // NOTE: register maybify data for user to be used when resolving
        uint256 currentProtocolFeeInBps = protocolFeeInBps;
        requestIdToMaybifySwap[maybifyId] = MaybifySwap({
            maybifyAmount: maybifyAmount,
            maybifyParams: maybifyParams,
            currentProtocolFeeInBps: currentProtocolFeeInBps,
            maybifiedAt: block.timestamp
        });
        emit MaybifiedSwapRegistered(
            maybifyId,
            maybifyParams.swapper,
            maybifyParams.probabilityInBps,
            maybifyAmount,
            block.timestamp,
            currentProtocolFeeInBps,
            maybifyParams.swapBackOnlyToEth,
            maybifyParams.swapBackSqrtPriceLimitX96,
            maybifyParams.swapBackParams,
            maybifyParams.swapBackIntendedOutToken
        );
    }

    // Directly maybifying using existing MAYBE, no need to swap from ETH to MAYBE to trigger a maybification, it expects the caller to send ETH for VRF payment
    function maybify(
        uint256 maybifyAmount,
        MaybifyParams memory maybifyParams
    ) external payable returns (uint256 maybifyId) {
        // NOTE: Validate maybify params (like make sure that probability and payouts are valid)
        if (maybifyParams.probabilityInBps > MAX_PROBABILITY_IN_BPS) {
            revert MaybifyingProbabilityCannotExceedMAX_PROBABILITY_IN_BPS(
                maybifyParams.probabilityInBps,
                MAX_PROBABILITY_IN_BPS
            );
        }
        // NOTE: Cannot maybify for 0 tokens
        if (maybifyAmount == 0) revert CannotMaybifyForZeroTokens();
        // burn for registering a maybification from the msg.sender
        maybeToken.burnFrom(msg.sender, maybifyAmount);
        // NOTE: request randomness, msg.sender is expected to call this func with some msg.value to be able to compansate for VRF fee that this contract should be paying
        (maybifyId /* uint256 vrfFeeInEth */, ) = _requestRandomness();
        // latestRegisteredMaybifyId value is set so that external contract can get the maybify id for their swap cuz we cant return value inside afterSwap()
        latestRegisteredMaybifyId = maybifyId;
        // Send back excessive ETH to caller (since msg.sender might send more ETH inside msg.value than we need for the VRF fee, we are sending back any excessive amount back to the caller)
        _safeTransferETH(msg.sender, address(this).balance);
        // if maybifyId is already in use for another maybify, revert
        if (requestIdToMaybifySwap[maybifyId].maybifyAmount != 0) {
            revert MaybificationAlreadyInProgressForGivenId(maybifyId);
        }
        // NOTE: register maybify data for user to be used when resolving
        uint256 currentProtocolFeeInBps = protocolFeeInBps;
        requestIdToMaybifySwap[maybifyId] = MaybifySwap({
            maybifyAmount: maybifyAmount,
            maybifyParams: maybifyParams,
            currentProtocolFeeInBps: currentProtocolFeeInBps,
            maybifiedAt: block.timestamp
        });
        emit MaybifiedSwapRegistered(
            maybifyId,
            maybifyParams.swapper,
            maybifyParams.probabilityInBps,
            maybifyAmount,
            block.timestamp,
            currentProtocolFeeInBps,
            maybifyParams.swapBackOnlyToEth,
            maybifyParams.swapBackSqrtPriceLimitX96,
            maybifyParams.swapBackParams,
            maybifyParams.swapBackIntendedOutToken
        );
    }

    function _requestRandomness()
        internal
        returns (uint256 requestId, uint256 requestPrice)
    {
        return
            requestRandomnessPayInNative(
                vrfCallbackGasLimit,
                vrfMinimumRequestConfirmations,
                1,
                VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            );
    }

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal virtual override {
        uint256 timestamp = requestIdToMaybifySwap[requestId].maybifiedAt;
        if (timestamp + vrfTimeout < block.timestamp) {
            revert VrfTimedOut(
                timestamp,
                timestamp + vrfTimeout + 1,
                block.timestamp
            );
        }
        resolveMaybifySwap(requestId, randomWords[0]);
    }

    // Only be callable by some resolver role
    function resolveAfterVRFTimeout(
        uint256 requestId
    ) external onlyRole(RESOLVER_ROLE) {
        uint256 timestamp = requestIdToMaybifySwap[requestId].maybifiedAt;
        if (timestamp + vrfTimeout >= block.timestamp) {
            revert VrfNotTimedOutYet(
                timestamp,
                timestamp + vrfTimeout + 1,
                block.timestamp
            );
        }
        // Create a psuedo random number
        uint256 randomness = uint256(
            keccak256(
                abi.encode(
                    requestId,
                    maybeToken.balanceOf(address(poolManager)),
                    maybeToken.totalSupply(),
                    block.number,
                    blockhash(block.number - 1),
                    block.timestamp,
                    tx.gasprice,
                    gasleft()
                )
            )
        );
        resolveMaybifySwap(requestId, randomness);
    }

    function resolveMaybifySwap(
        uint256 requestId,
        uint256 randomness
    ) internal {
        MaybifySwap memory maybifySwap = requestIdToMaybifySwap[requestId];
        delete requestIdToMaybifySwap[requestId]; // deleting the maybifySwap here because inside the _swapBack func we are potentially sending ETH and there could be an issue related to re-entrance so better safe than sorry, we are deleting before doing something else
        if (maybifySwap.maybifyAmount == 0)
            revert NoMaybificationToResolveForGivenId(requestId); // Means it has already been resolved or never got registered
        uint256 mintedMaybeAmount = 0;
        uint256 randomnessInBps = randomness % (MAX_PROBABILITY_IN_BPS + 1);
        // If user has lost, their swapBackState would be NOTHING_TO_SWAP_BACK and swapBackResultData would be empty
        SwapBackState swapBackState = SwapBackState.NOTHING_TO_SWAP_BACK;
        bytes memory swapBackResultData = abi.encode(0);
        if (randomnessInBps < maybifySwap.maybifyParams.probabilityInBps) {
            // since randomness is smaller than user's prob, user has won
            uint256 mintMultiplierInWad = ((MAX_PROBABILITY_IN_BPS -
                maybifySwap.currentProtocolFeeInBps) * 1e18) /
                maybifySwap.maybifyParams.probabilityInBps;
            mintedMaybeAmount = FullMath.mulDiv(
                mintMultiplierInWad,
                maybifySwap.maybifyAmount,
                1e18
            );
            // If swapper wants MAYBE as output, directly mint it to swapper
            if (
                !maybifySwap.maybifyParams.swapBackOnlyToEth &&
                maybifySwap.maybifyParams.swapBackParams.length == 0
            ) {
                // Swapper did not want to end their swap at ETH and did not provide any swap back params, so they will be getting MAYBE
                maybeToken.mint(
                    maybifySwap.maybifyParams.swapper,
                    mintedMaybeAmount
                );
                // user has won and just wants to receive MAYBE, their swapBackState should de be NEWLY_MINTED_MAYBE and swapBackResultData should be the minted MAYBE amount
                swapBackState = SwapBackState.NEWLY_MINTED_MAYBE;
                swapBackResultData = abi.encode(mintedMaybeAmount);
            } else {
                // If swapper wants ETH or any token X as swap output, mint MAYBE to this contract and swap back to desired token
                maybeToken.mint(address(this), mintedMaybeAmount);
                // Try to swap back those MAYBE tokens to whatever swapper specified
                // Different than swapping behaviour when registering, we dont revert inside resolvement as it would cause a security problem with VRF
                // Therefore, if some swap fails, user receives the latest output, like if user wanted to swap to token X yet had an error when swapping from MAYBE to ETH (which means that swap got partially consumed because of swapBackSqrtPriceLimitX96) they would get remaining MAYBE and ETH
                // If swap from MAYBE to ETH was successful yet swap from ETH to token X had a failure, user would receive ETH
                (swapBackState, swapBackResultData) = _swapBack(
                    maybifySwap.maybifyParams.swapper,
                    mintedMaybeAmount,
                    maybifySwap.maybifyParams.swapBackOnlyToEth,
                    maybifySwap.maybifyParams.swapBackSqrtPriceLimitX96,
                    maybifySwap.maybifyParams.swapBackParams,
                    maybifySwap.maybifyParams.swapBackIntendedOutToken
                );
            }
        }
        emit MaybifiedSwapResolved(
            requestId,
            maybifySwap.maybifyParams.swapper,
            randomness,
            randomnessInBps,
            mintedMaybeAmount,
            block.timestamp,
            swapBackState,
            swapBackResultData
        );
    }

    function _swapBack(
        address swapper,
        uint256 maybeSwapAmount,
        bool swapBackOnlyToEth,
        uint160 swapBackSqrtPriceLimitX96,
        bytes memory swapBackParams,
        address swapBackIntendedOutToken
    )
        internal
        returns (SwapBackState swapBackState, bytes memory swapBackResultData)
    {
        // Swap back to ETH using this pool
        BalanceDelta delta = abi.decode(
            poolManager.unlock(
                abi.encode(
                    poolKey,
                    SwapParams({
                        zeroForOne: false,
                        amountSpecified: -int256(maybeSwapAmount),
                        sqrtPriceLimitX96: swapBackSqrtPriceLimitX96
                    })
                )
            ),
            (BalanceDelta)
        );
        uint256 ethBalance = address(this).balance;
        // swap might have exited early because of sqrtPriceLimitX96, if thats the case (we understand it by checking if the consumed MAYBE amount (from balanceDelta value returned) equals amountSpecified for swap),
        // if swap was not consumed fully, we should just send the remaining ETH and MAYBE to the swapper instead of continuing as if swap was fully consumed
        if (uint256(int256(-delta.amount1())) != maybeSwapAmount) {
            // Since we are not swapping with hookData, beforeSwap or afterSwap will not manipulate delta amount so we can understand if swap was consumed fully or not by comparing it against amountSpecified value
            uint256 maybeBalance = maybeToken.balanceOf(address(this));
            maybeToken.transfer(swapper, maybeBalance);
            _safeTransferETH(swapper, ethBalance);
            // User wanted to swap yet had an error when swapping MAYBE for ETH so swapBackResult will be ETH amount and MAYBE amount encoded in that order
            swapBackState = SwapBackState
                .SWAP_FROM_MAYBE_TO_ETH_NOT_FULLY_CONSUMED;
            swapBackResultData = abi.encode(ethBalance, maybeBalance);
        } else {
            // Being here means that swap from MAYBE to ETH has been consumed fully so we can continue as expected
            // do not try to swap back further from ETH if user wanted to swap back only to ETH and there is no swapBackParams
            if (!swapBackOnlyToEth && swapBackParams.length != 0) {
                // zRouter needs ETH to swap out the entire balance (otherwise, we would be swapping using exactIn, and there could be some ETH leftover)
                // Therefore, we are calling zRouter and sending all of the ETH balance of this contract, to have the whole ETH amount to be used inside swaps (assuming swaps are encoded using swapAmount being 0)
                // Using the swapBackParams as input to zRouter, perform the swap back (we could have only used a slippage from user, but we would have to find the best quote on chain, which would not be gas efficient so although this quote might be a bit stale, it allows us to have an efficient way to performa a sufficient swap)
                // Make sure that the swapping with `to` param being the swapper (for encoding this zRouter call)
                // Dont forget to encode the zRouter's call that is encoded by zQuoter to be called with `to` param being the swapper as this would allow the output tokens to be sent to swapper directly
                // Get swapper's balance of token Y before swap
                uint256 balanceBeforeSwap = balanceOfAccount(
                    swapBackIntendedOutToken,
                    swapper
                );
                // Since we assume that the zRouter's call encoded by zQuoter is invoked with `to` address being the swapper all the outputted tokens will be sent to swapper, so dont have to do anything more to send them to swapper
                (bool ok, ) = address(zRouter).call{value: ethBalance}(
                    swapBackParams
                );
                if (!ok) {
                    // Looks like swapping from ETH to token Y has failed. So, will send ETH to user
                    _safeTransferETH(swapper, ethBalance);
                    // User wanted to swap yet had an error when swapping ETH for token Y so swapBackResult will be the ETH amount user receives
                    swapBackState = SwapBackState
                        .SWAP_FROM_ETH_TO_TOKEN_Y_FAILED;
                    swapBackResultData = abi.encode(ethBalance);
                } else {
                    // Get swapper's balance of token Y after swap
                    uint256 balanceAfterSwap = balanceOfAccount(
                        swapBackIntendedOutToken,
                        swapper
                    );
                    swapBackState = SwapBackState.SWAPPED_BACK_TO_TOKEN_Y;
                    if (balanceAfterSwap <= balanceBeforeSwap) {
                        // It means that `swapBackIntendedOutToken` was not really the output token encoded inside `swapBackParams` as swap was successful yet swapper received no tokens
                        // User probably received some other token but we cant really emit the info related to that
                        // We dont want to revert cuz this is only a problem for event info, looks like caller did not obey the rules so the event info will be wrong, we will emit `type(uint256).max` to indicate that we werent able to understand the amount user received for their output token
                        swapBackResultData = abi.encode(
                            swapBackIntendedOutToken,
                            type(uint256).max
                        );
                    } else {
                        // Given balance before and after, we can understand the token Y received, so we will encode the `swapBackIntendedOutToken` and balance change value for swapBackResultData
                        swapBackResultData = abi.encode(
                            swapBackIntendedOutToken,
                            balanceAfterSwap - balanceBeforeSwap
                        );
                    }
                }
            } else {
                // Send the swapped ETH to swapper
                _safeTransferETH(swapper, ethBalance);
                // User wanted to swap to ETH and it was successful so swapBackResult will be ETH amount user receives
                swapBackState = SwapBackState.SWAPPED_BACK_TO_ETH;
                swapBackResultData = abi.encode(ethBalance);
            }
        }
    }

    function unlockCallback(
        bytes calldata rawData
    ) external onlyPoolManager returns (bytes memory) {
        (
            PoolKey memory maybeEthPoolKey,
            SwapParams memory swapParamsForMaybeToEth
        ) = abi.decode(rawData, (PoolKey, SwapParams));
        // Call to swap MAYBE for ETH
        BalanceDelta delta = poolManager.swap(
            maybeEthPoolKey,
            swapParamsForMaybeToEth,
            ""
        );
        // This swap might not be consumed fully because of swapParamsForMaybeToEth.sqrtPriceLimitX96
        // We perform settle and takes in here not matter what and will handle the extra logic based on returned delta amount
        if (delta.amount0() < 0) {
            maybeEthPoolKey.currency0.settle(
                poolManager,
                address(this),
                uint256(int256(-delta.amount0())),
                false
            );
        }
        if (delta.amount1() < 0) {
            maybeEthPoolKey.currency1.settle(
                poolManager,
                address(this),
                uint256(int256(-delta.amount1())),
                false
            );
        }
        if (delta.amount0() > 0) {
            maybeEthPoolKey.currency0.take(
                poolManager,
                address(this),
                uint256(int256(delta.amount0())),
                false
            );
        }
        if (delta.amount1() > 0) {
            maybeEthPoolKey.currency1.take(
                poolManager,
                address(this),
                uint256(int256(delta.amount1())),
                false
            );
        }

        return abi.encode(delta);
    }

    function _isMaybe(Currency c) internal view returns (bool) {
        return Currency.unwrap(c) == address(maybeToken);
    }

    function _isEth(Currency c) internal pure returns (bool) {
        return Currency.unwrap(c) == address(0);
    }

    function _safeTransferETH(address to, uint256 amount) internal {
        assembly ("memory-safe") {
            if iszero(
                call(gas(), to, amount, codesize(), 0x00, codesize(), 0x00)
            ) {
                mstore(0x00, 0xb12d13eb)
                revert(0x1c, 0x04)
            }
        }
    }

    function _outputCurrency(
        PoolKey calldata key,
        SwapParams calldata params
    ) internal pure returns (Currency) {
        return params.zeroForOne ? key.currency1 : key.currency0;
    }

    receive() external payable {}
}

function balanceOfAccount(
    address token,
    address account
) view returns (uint256 amount) {
    assembly ("memory-safe") {
        mstore(0x14, account)
        mstore(0x00, 0x70a08231000000000000000000000000)
        amount := mul(
            mload(0x20),
            and(
                gt(returndatasize(), 0x1f),
                staticcall(gas(), token, 0x10, 0x24, 0x20, 0x20)
            )
        )
    }
}
