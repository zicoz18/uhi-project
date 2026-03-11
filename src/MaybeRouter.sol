import {IMaybeToken} from "./interfaces/IMaybeToken.sol";
import {IMaybeHook} from "./interfaces/IMaybeHook.sol";
import {IzRouter} from "zRouter/src/IzRouter.sol";
import {MaybeToken} from "./MaybeToken.sol";
import {MaybeHook} from "./MaybeHook.sol";

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {CurrencySettler} from "@uniswap/hooks/utils/CurrencySettler.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MaybeRouter {
    using CurrencyLibrary for Currency;
    using CurrencySettler for Currency;

    IPoolManager public immutable poolManager;
    IMaybeToken public immutable maybeToken;
    IzRouter public immutable zRouter;
    PoolKey public maybeEthPool;

    // MaybeHook does emit data related to how many MAYBE got burnt when registering, it also emits how many MAYBE got minted at resolvement and also the swap back results like how MAYBE got swapped back to ETH or even back to token Y
    // Yet we need to emit data related to swapping from token X to MAYBE to be able to have all the related to swapping from token X to token Y (divided in to token X to MAYBE and MAYBE to token Y)
    // Therefore, MaybeRouter has to emit info related to swapping from token X to MAYBE (input token could be ETH and in that case it will only emit related to ETH to MAYBE, otherwise it will emit data for swapping token X to MAYBE)
    // Problem is, we cant directly link MaybeRouter's events with MaybeHook's events like MaybeHook connect register and resolvement via vrf requestId yet router is not aware of that as it happens inside afterSwap()
    // But what we can do is, store the latest registered maybify id inside MaybeHook contract and get that value inside this contract just after swapping and we would have the same maybifyId as MaybeHook
    // With that id we can actually match the swap that happened before maybifying with the maybification
    event SwapBeforeMaybifying(
        uint256 indexed maybifyId,
        address indexed swapper,
        address inToken,
        uint256 inTokenAmount
    );

    error InTokenCantBeMaybe();
    error ZRouterCallToSwapInTokenToEthFailed(bytes reason);
    error SwappingEthToMaybeHitPriceLimitAndDidNotConsumeEthFully(
        uint256 ethExpectedToSwap,
        uint256 actualyEthConsumed
    );
    error OnlyPoolManagerCanTriggerCallback(address caller);

    constructor(
        IPoolManager _poolManager,
        IMaybeToken _maybeToken,
        IzRouter _zRouter,
        PoolKey memory _maybeEthPool
    ) {
        poolManager = _poolManager;
        maybeToken = _maybeToken;
        zRouter = _zRouter;
        maybeEthPool = _maybeEthPool;
    }

    // This maybeSwap func should allow user to swap from token X to ETH using ZROUTER (with the help of ZQUOTER) (NOTE: User can start by sending ETH directly as well, in that case we skip ZROUTER step)
    // After getting ETH, maybeSwap will manually swap received ETH for MAYBE with hookData so that this manually registers maybify and support swapping back to token Y with newly minted MAYBE tokens
    // ETH should be received by this router contract and not for the user so call zQuoter with `to` being this router contract instead of the user
    // As a result you can call this func with in token being either ETH or some token X. But you can not call it with token in being MAYBE as it would try to swap MAYBE to ETH and then ETH to MAYBE. So, rather call MaybeHook.maybify() if in token is MAYBE
    function maybeSwap(
        // Exact in, these gotta be in line with multicall's starting tokens for multicall to be successfull, because we will be taking these tokens from user and then swapping against zRouter using them and for zRouter to be successful, we do need to get these tokens from user before calling it
        // If user input wrong values, the multicall will fail because MaybeRouter will not be able to pay zRouter for the swap
        address exactInToken,
        uint256 exactInAmount,
        // Params for swapping from Token X to ETH (if exactInToken is zero address, therefore inToken is ETH, below param is not used)
        bytes calldata multicall,
        // Params for swapping from ETH to MAYBE
        uint160 sqrtPriceLimitX96, // Reason why we have this instead of slippage bps type of input is, we dont know the exact amount of tokens that will be used for the swap. Therefore, trying to check slippage from amount output becomes difficult, so what we are doing is, setting slippage via price change. Since we dont know the swap amount, this is more useful as we would end the swap if price moves more than x%, effectively having slippage
        // Params for maybifying
        uint256 probabilityInBps,
        bool swapBackOnlyToEth,
        // Params for swapping newly minted MAYBE to ETH
        uint160 swapBackSqrtPriceLimitX96,
        // Params for swapping ETH to Token Y
        bytes calldata swapBackParams,
        // Below param is only used for emitting events in a useful way. It does not actually change the swapping logic. So, it will not cause a revert if its wrong and only used if you are swapping back to token Y (so not getting ETH or MAYBE as output)
        address swapBackIntendedOutToken
    ) public payable {
        // As a result user's UI of swapping from token X to token Y (X => Y) is divided into token X to MAYBE and then MAYBE to token Y (X => MAYBE => Y)
        if (exactInToken == address(maybeToken)) {
            revert InTokenCantBeMaybe();
        }
        if (exactInToken != address(0)) {
            IERC20(exactInToken).transferFrom(
                msg.sender,
                address(this),
                exactInAmount
            );
            IERC20(exactInToken).approve(address(zRouter), exactInAmount);
            (bool ok, bytes memory result) = address(zRouter).call(multicall);
            if (!ok) revert ZRouterCallToSwapInTokenToEthFailed(result);
        }
        uint256 ethToSwap = address(this).balance;
        BalanceDelta delta = abi.decode(
            poolManager.unlock(
                abi.encode(
                    MaybeHook.MaybifyParams({
                        swapper: msg.sender,
                        probabilityInBps: probabilityInBps,
                        swapBackOnlyToEth: swapBackOnlyToEth,
                        swapBackSqrtPriceLimitX96: swapBackSqrtPriceLimitX96,
                        swapBackParams: swapBackParams,
                        swapBackIntendedOutToken: swapBackIntendedOutToken
                    }),
                    SwapParams({
                        zeroForOne: true, // Fixed to be true as we know we want to swap ETH for MAYBE
                        amountSpecified: -int256(ethToSwap),
                        sqrtPriceLimitX96: sqrtPriceLimitX96
                    })
                )
            ),
            (BalanceDelta)
        );
        // Swap has happened and maybification got registered inside the afterSwap(), but we gotta make sure that swap from ETH to MAYBE got consumed fully and did not exit swap early because of sqrtPriceLimitX96
        // If swap is not fully consumed, its an unexpected outcome for the user therefore, we sould revert the tx
        if (uint256(int256(-delta.amount0())) != ethToSwap) {
            revert SwappingEthToMaybeHitPriceLimitAndDidNotConsumeEthFully(
                ethToSwap,
                uint256(int256(-delta.amount0()))
            );
        }

        // Get the latest registered maybification's id, which should be the one we have just registered using the call to swap above
        uint256 maybifyId = IMaybeHook(address(maybeEthPool.hooks))
            .latestRegisteredMaybifyId();

        emit SwapBeforeMaybifying(
            maybifyId,
            msg.sender,
            exactInToken,
            exactInToken == address(0) ? ethToSwap : exactInAmount
        );
    }

    function unlockCallback(
        bytes calldata rawData
    ) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) {
            revert OnlyPoolManagerCanTriggerCallback(msg.sender);
        }
        (
            MaybeHook.MaybifyParams memory maybifyParams,
            SwapParams memory swapParamsForEthToMaybe
        ) = abi.decode(rawData, (MaybeHook.MaybifyParams, SwapParams));

        // Call to swap ETH for MAYBE, this should swap from ETH to MAYBE
        // Well, potentially this swap can hit the price limit and therefore stop the swap before swapping all the inputted ETH. In such a case, ETH would get stuck in this contract...
        // Therefore, in such a case, where swap is not consumed fully, we should revert the tx, we will do it based on the delta value returned
        BalanceDelta delta = poolManager.swap(
            maybeEthPool,
            swapParamsForEthToMaybe,
            abi.encode(maybifyParams)
        );

        // Since MaybeRouter had the ETH, it should be the paying for the ETH, so the zRouter calldata should be encoded such that swapping to receive ETH should send the outputted ETH to this MaybeRouter
        if (delta.amount0() < 0) {
            maybeEthPool.currency0.settle(
                poolManager,
                address(this),
                uint256(int256(-delta.amount0())),
                false
            );
        }

        return abi.encode(delta);
    }

    receive() external payable {}
}
