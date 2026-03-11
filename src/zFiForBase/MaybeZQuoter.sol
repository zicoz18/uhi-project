// SPDX-License-Identifier: MIT
// Compile with: solc 0.8.33 | via_ir: true | optimizer: true, runs: 20
// Required foundry.toml:
//   [profile.default.optimizer_details]
//   yul = false
// Disabling the Yul optimizer with via_ir keeps contract under EIP-170 (24,576 bytes).
pragma solidity ^0.8.33;

interface IZQuoterBase {
    function quoteV2(
        bool,
        address,
        address,
        uint256
    ) external view returns (uint256, uint256);

    function quoteV3(
        bool,
        address,
        address,
        uint24,
        uint256
    ) external view returns (uint256, uint256);

    function quoteV4(
        bool,
        address,
        address,
        uint24,
        int24,
        address,
        uint256
    ) external view returns (uint256, uint256);

    function quoteZAMM(
        bool,
        uint256,
        address,
        address,
        uint256,
        uint256,
        uint256
    ) external view returns (uint256, uint256);
}

IZQuoterBase constant _BASE = IZQuoterBase(
    0xdEEac226B7E6146E79bcca4dd7224F131d631a8C
);

/// @dev This is a fork of @z0r0z's zQuoterBase contract. We have adjusted the contract for it to be deployed on Base
contract MaybeZQuoter {
    enum AMM {
        UNI_V2,
        ZAMM,
        UNI_V3,
        UNI_V4,
        WETH_WRAP,
        V4_HOOKED
    }

    struct Quote {
        AMM source;
        uint256 feeBps;
        uint256 amountIn;
        uint256 amountOut;
    }

    constructor() payable {}

    function getQuotes(
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount
    ) public view returns (Quote memory best, Quote[] memory quotes) {
        (best, quotes) = MaybeZQuoter(address(_BASE)).getQuotes(
            exactOut,
            tokenIn,
            tokenOut,
            swapAmount
        );
        // Reject exact-out V3 best if round-trip proves phantom liquidity.
        // Only neuter the specific fee tier that failed — other V3 tiers (e.g. 30bp) may be healthy.
        while (exactOut && best.source == AMM.UNI_V3 && best.amountIn > 0) {
            (, uint256 rt) = _BASE.quoteV3(
                false,
                tokenIn,
                tokenOut,
                uint24(best.feeBps * 100),
                best.amountIn
            );
            if (rt * 10 >= swapAmount * 9) break; // healthy — keep it
            uint256 badFee = best.feeBps;
            best = Quote(AMM.UNI_V2, 0, 0, 0);
            for (uint256 i; i < quotes.length; ++i) {
                if (
                    quotes[i].source == AMM.UNI_V3 && quotes[i].feeBps == badFee
                ) {
                    quotes[i].amountIn = 0;
                    quotes[i].amountOut = 0;
                    continue;
                }
                if (
                    quotes[i].amountIn > 0 &&
                    (best.amountIn == 0 || quotes[i].amountIn < best.amountIn)
                ) best = quotes[i];
            }
            // Loop: if new best is also V3, round-trip check it too
        }
    }

    function _asQuote(
        AMM source,
        uint256 amountIn,
        uint256 amountOut
    ) internal pure returns (Quote memory q) {
        q.source = source;
        q.amountIn = amountIn;
        q.amountOut = amountOut;
    }

    /// @notice Unified single-hop quoting across all AMMs.
    function _quoteBestSingleHop(
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) internal view returns (Quote memory best) {
        // 1. Base quoter: V2/ZAMM/V3/V4 (getQuotes already filters exact-out outliers)
        (best, ) = getQuotes(exactOut, tokenIn, tokenOut, amount);
    }

    // zRouter calldata builders:

    error NoRoute();

    function _hubs() internal pure returns (address[5] memory) {
        return [WETH, USDC, USDT, DAI, WBTC];
    }

    function _sweepTo(
        address token,
        address to
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                IRouterExt.sweep.selector,
                token,
                uint256(0),
                uint256(0),
                to
            );
    }

    function _mc(bytes[] memory c) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IRouterExt.multicall.selector, c);
    }

    function _mc1(bytes memory cd) internal pure returns (bytes memory) {
        bytes[] memory c = new bytes[](1);
        c[0] = cd;
        return _mc(c);
    }

    function _wrap(uint256 a) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IRouterExt.wrap.selector, a);
    }

    function _depUnwrap(
        uint256 a
    ) internal pure returns (bytes memory d, bytes memory u) {
        d = abi.encodeWithSelector(
            IRouterExt.deposit.selector,
            WETH,
            uint256(0),
            a
        );
        u = abi.encodeWithSelector(IRouterExt.unwrap.selector, a);
    }

    function _i8(int128 x) internal pure returns (uint8) {
        return uint8(uint256(int256(x)));
    }

    function _isBetter(
        bool exactOut,
        uint256 newIn,
        uint256 newOut,
        uint256 bestIn,
        uint256 bestOut
    ) internal pure returns (bool) {
        return
            exactOut
                ? (newIn > 0 && (newIn < bestIn || bestIn == 0))
                : (newOut > bestOut);
    }

    // ** CURVE

    // ====================== QUOTE (auto-discover via MetaRegistry) ======================

    // Accumulator for 2-hop hub routing
    struct HubPlan {
        bool found;
        bool isExactOut;
        address mid;
        Quote a;
        Quote b;
        bytes ca;
        bytes cb;
        uint256 scoreIn;
        uint256 scoreOut;
    }

    // Accumulator for 3-hop route discovery
    struct Route3 {
        bool found;
        Quote a;
        Quote b;
        Quote c;
        address mid1;
        address mid2;
        uint256 score;
    }

    // ====================== BUILD CALLDATA (single-hop) ======================

    // ====================== TOP-LEVEL BUILDER ======================

    function buildBestSwap(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 slippageBps,
        uint256 deadline,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (
            Quote memory best,
            bytes memory callData,
            uint256 amountLimit,
            uint256 msgValue
        )
    {
        // ---------- ETH <-> WETH (1:1, no slippage) ----------
        if (
            (tokenIn == address(0) && tokenOut == WETH) ||
            (tokenIn == WETH && tokenOut == address(0))
        ) {
            best = _asQuote(AMM.WETH_WRAP, swapAmount, swapAmount);
            amountLimit = swapAmount; // 1:1, no slippage

            if (tokenIn == address(0)) {
                // ETH -> WETH
                msgValue = swapAmount;
                if (to == ZROUTER) {
                    callData = _wrap(swapAmount);
                } else {
                    bytes[] memory c = new bytes[](2);
                    c[0] = _wrap(swapAmount);
                    c[1] = abi.encodeWithSelector(
                        IRouterExt.sweep.selector,
                        WETH,
                        uint256(0),
                        swapAmount,
                        to
                    );
                    callData = _mc(c);
                }
            } else {
                // WETH -> ETH
                msgValue = 0;
                (bytes memory dep, bytes memory unw) = _depUnwrap(swapAmount);
                if (to == ZROUTER) {
                    bytes[] memory c = new bytes[](2);
                    c[0] = dep;
                    c[1] = unw;
                    callData = _mc(c);
                } else {
                    bytes[] memory c = new bytes[](3);
                    c[0] = dep;
                    c[1] = unw;
                    c[2] = abi.encodeWithSelector(
                        IRouterExt.sweep.selector,
                        address(0),
                        uint256(0),
                        swapAmount,
                        to
                    );
                    callData = _mc(c);
                }
            }
            return (best, callData, amountLimit, msgValue);
        }

        // ---------- Normal path ----------
        // Single unified quote across all sources (V2/Sushi/V3/V4/ZAMM/Curve/Lido)
        best = _quoteBestSingleHop(exactOut, tokenIn, tokenOut, swapAmount);
        if (exactOut ? best.amountIn == 0 : best.amountOut == 0)
            revert NoRoute();

        uint256 quoted = exactOut ? best.amountIn : best.amountOut;
        amountLimit = SlippageLib.limit(exactOut, quoted, slippageBps);

        callData = _buildCalldataFromBest(
            to,
            exactOut,
            tokenIn,
            tokenOut,
            swapAmount,
            amountLimit,
            slippageBps,
            deadline,
            best,
            omitSwapAmountForBuildingCalldata
        );

        msgValue = _requiredMsgValue(
            exactOut,
            tokenIn,
            swapAmount,
            amountLimit
        );
    }

    function _spacingFromBps(uint16 bps) internal pure returns (int24) {
        unchecked {
            if (bps == 1) return 1;
            if (bps == 5) return 10;
            if (bps == 30) return 60;
            if (bps == 100) return 200;
            return int24(uint24(bps));
        }
    }

    /* msg.value rule (matches zRouter):
       tokenIn==ETH → exactIn: swapAmount, exactOut: amountLimit; else 0. */
    function _requiredMsgValue(
        bool exactOut,
        address tokenIn,
        uint256 swapAmount,
        uint256 amountLimit
    ) internal pure returns (uint256) {
        return
            tokenIn == address(0) ? (exactOut ? amountLimit : swapAmount) : 0;
    }

    function _bestSingleHop(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 slippageBps,
        uint256 deadline,
        bool omitSwapAmountForBuildingCalldata
    )
        internal
        view
        returns (
            bool ok,
            Quote memory q,
            bytes memory data,
            uint256 amountLimit,
            uint256 msgValue
        )
    {
        try
            this.buildBestSwap(
                to,
                exactOut,
                tokenIn,
                tokenOut,
                amount,
                slippageBps,
                deadline,
                omitSwapAmountForBuildingCalldata
            )
        returns (Quote memory q_, bytes memory d_, uint256 l_, uint256 v_) {
            return (true, q_, d_, l_, v_);
        } catch {
            return (false, q, bytes(""), 0, 0);
        }
    }

    // ** MULTIHOP HELPER

    function buildBestSwapViaETHMulticall(
        address to,
        address refundTo,
        bool exactOut, // false = exactIn, true = exactOut (on tokenOut)
        address tokenIn, // ERC20 or address(0) for ETH
        address tokenOut, // ERC20 or address(0) for ETH
        uint256 swapAmount, // exactIn: amount of tokenIn; exactOut: desired tokenOut
        uint256 slippageBps, // per-leg bound
        uint256 deadline,
        uint24 hookPoolFee,
        int24 hookTickSpacing,
        address hookAddress,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (
            Quote memory a,
            Quote memory b,
            bytes[] memory calls,
            bytes memory multicall,
            uint256 msgValue
        )
    {
        unchecked {
            // Prevent stealable leftovers: if refundTo is the router itself, coerce to `to`.
            if (refundTo == ZROUTER && to != ZROUTER) refundTo = to;

            // ---------- FAST PATH #1: pure ETH<->WETH wrap/unwrap ----------
            bool trivialWrap = (tokenIn == address(0) && tokenOut == WETH) ||
                (tokenIn == WETH && tokenOut == address(0));
            if (trivialWrap) {
                a = _asQuote(AMM.WETH_WRAP, swapAmount, swapAmount);
                b = Quote(AMM.UNI_V2, 0, 0, 0);

                if (tokenIn == address(0)) {
                    // ETH -> WETH: wrap exact amount then sweep WETH to recipient
                    calls = new bytes[](2);
                    calls[0] = _wrap(swapAmount);
                    calls[1] = _sweepTo(WETH, to);
                    msgValue = swapAmount;
                } else {
                    // WETH -> ETH: deposit WETH, unwrap exact amount, sweep ETH to recipient
                    calls = new bytes[](3);
                    (calls[0], calls[1]) = _depUnwrap(swapAmount);
                    calls[2] = _sweepTo(address(0), to);
                    msgValue = 0;
                }

                multicall = _mc(calls);
                return (a, b, calls, multicall, msgValue);
            }

            // ---------- FAST PATH #2: direct single-hop (may be Curve/V2/V3/V4/zAMM/V4_HOOKED) ----------
            // We always try hub routing too and compare, because low-liquidity pools
            // (e.g. V3 1bp) can return tiny dust outputs that technically "succeed" but
            // produce reverts at execution or give users effectively nothing.
            bool _singleOk;
            Quote memory _singleBest;
            bytes memory _singleCallData;
            uint256 _singleMsgValue;
            {
                (
                    bool ok,
                    Quote memory best,
                    bytes memory callData,
                    ,
                    uint256 val
                ) = _bestSingleHop(
                        to,
                        exactOut,
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        slippageBps,
                        deadline,
                        omitSwapAmountForBuildingCalldata
                    );

                // Also try hooked pool if applicable (ETH input only, exactIn)
                if (
                    hookAddress != address(0) &&
                    tokenIn == address(0) &&
                    !exactOut
                ) {
                    uint256 hookedOut = _tryQuoteV4Hooked(
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        hookPoolFee,
                        hookTickSpacing,
                        hookAddress
                    );
                    if (hookedOut > 0 && (!ok || hookedOut > best.amountOut)) {
                        ok = true;
                        best = Quote(
                            AMM.V4_HOOKED,
                            hookPoolFee,
                            swapAmount,
                            hookedOut
                        );
                        callData = _buildV4HookedCalldata(
                            to,
                            tokenIn,
                            tokenOut,
                            swapAmount,
                            SlippageLib.limit(false, hookedOut, slippageBps),
                            deadline,
                            hookPoolFee,
                            hookTickSpacing,
                            hookAddress
                        );
                        val = swapAmount;
                    }
                }

                if (ok) {
                    _singleOk = true;
                    _singleBest = best;
                    _singleCallData = callData;
                    _singleMsgValue = val;
                }
            }

            // ---------- HUB LIST (majors) ----------
            address[5] memory HUBS = _hubs();

            // Track the best hub plan we can actually build
            HubPlan memory plan;
            plan.isExactOut = exactOut;

            for (uint256 h; h < HUBS.length; ++h) {
                address MID = HUBS[h];
                if (MID == tokenIn || MID == tokenOut) continue;

                if (!exactOut) {
                    // ---- overall exactIn: maximize final output ----
                    (
                        bool okA,
                        Quote memory qa,
                        bytes memory ca,
                        ,

                    ) = _bestSingleHop(
                            ZROUTER,
                            false,
                            tokenIn,
                            MID,
                            swapAmount,
                            slippageBps,
                            deadline,
                            omitSwapAmountForBuildingCalldata
                        );

                    uint256 midAmtForLeg2 = SlippageLib.limit(
                        false,
                        qa.amountOut,
                        slippageBps
                    );
                    (
                        bool okB,
                        Quote memory qb,
                        bytes memory cb,
                        ,

                    ) = _bestSingleHop(
                            to,
                            false,
                            MID,
                            tokenOut,
                            midAmtForLeg2,
                            slippageBps,
                            deadline,
                            omitSwapAmountForBuildingCalldata
                        );
                    if (!okB || qb.amountOut == 0) continue;

                    uint256 scoreOut = qb.amountOut; // maximize

                    if (!plan.found || scoreOut > plan.scoreOut) {
                        plan.found = true;
                        plan.mid = MID;
                        plan.isExactOut = false;
                        plan.a = qa;
                        plan.b = qb;
                        plan.ca = ca;
                        plan.cb = cb;
                        plan.scoreOut = scoreOut;
                    }
                } else {
                    // ---- overall exactOut: minimize total input ----
                    // Always route both legs through ZROUTER to avoid correctness issues
                    // with prefunding V2 pools (Curve/zAMM don't mark transient for the pair,
                    // and exactOut prefund risks donating excess to LPs).
                    (
                        bool okB,
                        Quote memory qb,
                        bytes memory cb,
                        ,

                    ) = _bestSingleHop(
                            ZROUTER,
                            true,
                            MID,
                            tokenOut,
                            swapAmount,
                            slippageBps,
                            deadline,
                            omitSwapAmountForBuildingCalldata
                        );

                    uint256 midRequired = qb.amountIn;
                    uint256 midLimit = SlippageLib.limit(
                        true,
                        midRequired,
                        slippageBps
                    );

                    (
                        bool okA,
                        Quote memory qa,
                        bytes memory ca,
                        ,

                    ) = _bestSingleHop(
                            ZROUTER,
                            true,
                            tokenIn,
                            MID,
                            midLimit,
                            slippageBps,
                            deadline,
                            omitSwapAmountForBuildingCalldata
                        );

                    uint256 scoreIn = qa.amountIn; // minimize

                    if (!plan.found || scoreIn < plan.scoreIn) {
                        plan.found = true;
                        plan.mid = MID;
                        plan.isExactOut = true;
                        plan.a = qa;
                        plan.b = qb;
                        plan.ca = ca;
                        plan.cb = cb;
                        plan.scoreIn = scoreIn;
                    }
                }
            }

            // ---------- pick winner: single-hop vs hub routing ----------
            // exactOut: prefer direct (reliability > marginal savings). Hub only if no direct.
            // exactIn: hub must be >2% better to justify multi-leg complexity.
            if (plan.found) {
                bool hubBetter;
                if (exactOut) {
                    hubBetter = !_singleOk;
                } else {
                    hubBetter =
                        !_singleOk ||
                        plan.scoreOut * 49 > _singleBest.amountOut * 50;
                }
                if (!hubBetter) plan.found = false;
            }

            if (!plan.found) {
                // Use single-hop (or revert if neither worked)
                if (!_singleOk) revert NoRoute();
                calls = new bytes[](1);
                calls[0] = _singleCallData;
                a = _singleBest;
                b = Quote(AMM.UNI_V2, 0, 0, 0);
                msgValue = _singleMsgValue;
                multicall = _mc(calls);
                return (a, b, calls, multicall, msgValue);
            }

            // ---------- materialize the chosen hub plan into calls ----------
            if (!plan.isExactOut) {
                // exactIn path: two calls, no sweeps
                calls = new bytes[](2);
                calls[0] = plan.ca; // hop-1 tokenIn -> MID (exactIn)
                // hop-2: swapAmount=0 so router auto-consumes full MID balance
                calls[1] = _buildCalldataFromBest(
                    to,
                    false,
                    plan.mid,
                    tokenOut,
                    0,
                    SlippageLib.limit(false, plan.b.amountOut, slippageBps),
                    slippageBps,
                    deadline,
                    plan.b,
                    omitSwapAmountForBuildingCalldata
                );
                a = plan.a;
                b = plan.b;
                // If tokenIn is ETH, hop-1 needs ETH for exactIn
                msgValue = (tokenIn == address(0)) ? swapAmount : 0;
            } else {
                // exactOut path: both legs route to ZROUTER, then explicit sweeps.
                // Unconditionally sweep all possible leftover tokens to avoid stranding
                // funds in the router (where sweep() is public).
                bool chaining = (to == ZROUTER);
                bool ethInput = (tokenIn == address(0));

                // Count finalization calls (when not chaining, sweep everything out):
                //   1) tokenOut delivery (exact swapAmount)
                //   2) MID leftover refund (over-production from slippage buffer)
                //   3) tokenIn leftover refund (any venue can leave dust in exactOut)
                //   4) ETH dust refund (when tokenIn is ETH)
                uint256 extra;
                if (!chaining) {
                    extra++; // tokenOut delivery
                    extra++; // MID leftover
                    if (!ethInput) extra++; // tokenIn leftover (ERC20)
                    extra++; // ETH dust (always: even non-ETH input can have ETH from unwraps)
                }

                calls = new bytes[](2 + extra);
                uint256 k;
                calls[k++] = plan.ca; // hop-1 tokenIn -> MID (exactOut, to=ZROUTER)
                calls[k++] = plan.cb; // hop-2 MID -> tokenOut (exactOut, to=ZROUTER)

                if (!chaining) {
                    // Deliver exact output amount to recipient
                    calls[k++] = abi.encodeWithSelector(
                        IRouterExt.sweep.selector,
                        tokenOut,
                        uint256(0),
                        swapAmount,
                        to
                    );
                    // Refund leftover MID (as-is, WETH stays as WETH)
                    calls[k++] = _sweepTo(plan.mid, refundTo);
                    // Refund leftover tokenIn (ERC20 only; ETH covered by ETH dust sweep)
                    if (!ethInput) {
                        calls[k++] = _sweepTo(tokenIn, refundTo);
                    }
                    // Refund any ETH dust
                    calls[k++] = _sweepTo(address(0), refundTo);
                }

                a = plan.a;
                b = plan.b;
                // If tokenIn is ETH, hop-1 exactOut needs ETH equal to its maxIn limit
                msgValue = ethInput
                    ? SlippageLib.limit(true, plan.a.amountIn, slippageBps)
                    : 0;
            }

            multicall = _mc(calls);
            return (a, b, calls, multicall, msgValue);
        }
    }

    // ** 3-HOP MULTIHOP BUILDER

    /// @notice Encode a non-Curve single-hop swap from a Quote with an arbitrary
    ///         swapAmount.  Pass swapAmount = 0 so the router auto-reads its own
    ///         token balance as the input amount (exactIn only).
    function _buildSwapFromQuote(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline,
        Quote memory q,
        bool omitSwapAmountForBuildingCalldata
    ) internal pure returns (bytes memory) {
        if (q.source == AMM.UNI_V2) {
            return
                abi.encodeWithSelector(
                    IZRouter.swapV2.selector,
                    to,
                    exactOut,
                    tokenIn,
                    tokenOut,
                    omitSwapAmountForBuildingCalldata ? 0 : swapAmount,
                    amountLimit,
                    deadline
                );
        } else if (q.source == AMM.ZAMM) {
            return
                abi.encodeWithSelector(
                    IZRouter.swapVZ.selector,
                    to,
                    exactOut,
                    q.feeBps,
                    tokenIn,
                    tokenOut,
                    0,
                    0,
                    omitSwapAmountForBuildingCalldata ? 0 : swapAmount,
                    amountLimit,
                    deadline
                );
        } else if (q.source == AMM.UNI_V3) {
            return
                abi.encodeWithSelector(
                    IZRouter.swapV3.selector,
                    to,
                    exactOut,
                    uint24(q.feeBps * 100),
                    tokenIn,
                    tokenOut,
                    omitSwapAmountForBuildingCalldata ? 0 : swapAmount,
                    amountLimit,
                    deadline
                );
        } else if (q.source == AMM.UNI_V4) {
            return
                abi.encodeWithSelector(
                    IZRouter.swapV4.selector,
                    to,
                    exactOut,
                    uint24(q.feeBps * 100),
                    _spacingFromBps(uint16(q.feeBps)),
                    tokenIn,
                    tokenOut,
                    omitSwapAmountForBuildingCalldata ? 0 : swapAmount,
                    amountLimit,
                    deadline
                );
        }
        revert NoRoute();
    }

    /// @notice Build a 3-hop exactIn multicall:
    ///           tokenIn ─[Leg1]→ MID1 ─[Leg2]→ MID2 ─[Leg3]→ tokenOut
    ///
    ///         Legs 2 & 3 use swapAmount = 0 so the router auto-consumes the
    ///         previous leg's output via balanceOf().
    ///
    ///         Route discovery: tries every ordered pair (MID1, MID2) from the
    ///         hub list and picks the path that maximizes final output.
    ///         All AMMs (V2/V3/V4/zAMM) are considered for each leg.
    function build3HopMulticall(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 slippageBps,
        uint256 deadline,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (
            Quote memory a,
            Quote memory b,
            Quote memory c,
            bytes[] memory calls,
            bytes memory multicall,
            uint256 msgValue
        )
    {
        unchecked {
            address[5] memory HUBS = _hubs();

            Route3 memory r;

            for (uint256 i; i < HUBS.length; ++i) {
                address MID1 = HUBS[i];
                if (MID1 == tokenIn || MID1 == tokenOut) continue;

                Quote memory qa = _quoteBestSingleHop(
                    false,
                    tokenIn,
                    MID1,
                    swapAmount
                );

                uint256 mid1Amt = SlippageLib.limit(
                    false,
                    qa.amountOut,
                    slippageBps
                );

                for (uint256 j; j < HUBS.length; ++j) {
                    address MID2 = HUBS[j];
                    if (MID2 == tokenIn || MID2 == tokenOut || MID2 == MID1)
                        continue;

                    Quote memory qb = _quoteBestSingleHop(
                        false,
                        MID1,
                        MID2,
                        mid1Amt
                    );
                    if (qb.amountOut == 0) continue;

                    uint256 mid2Amt = SlippageLib.limit(
                        false,
                        qb.amountOut,
                        slippageBps
                    );

                    Quote memory qc = _quoteBestSingleHop(
                        false,
                        MID2,
                        tokenOut,
                        mid2Amt
                    );
                    if (qc.amountOut == 0) continue;

                    if (!r.found || qc.amountOut > r.score) {
                        r.found = true;
                        r.a = qa;
                        r.b = qb;
                        r.c = qc;
                        r.mid1 = MID1;
                        r.mid2 = MID2;
                        r.score = qc.amountOut;
                    }
                }
            }

            if (!r.found) revert NoRoute();

            calls = new bytes[](3);

            // Leg 1: via buildBestSwap (handles all AMMs including Curve)
            (a, calls[0], , msgValue) = buildBestSwap(
                ZROUTER,
                false,
                tokenIn,
                r.mid1,
                swapAmount,
                slippageBps,
                deadline,
                omitSwapAmountForBuildingCalldata
            );

            // Legs 2 & 3: build calldata for any AMM type with swapAmount=0
            calls[1] = _buildCalldataFromBest(
                ZROUTER,
                false,
                r.mid1,
                r.mid2,
                0,
                SlippageLib.limit(false, r.b.amountOut, slippageBps),
                slippageBps,
                deadline,
                r.b,
                omitSwapAmountForBuildingCalldata
            );

            calls[2] = _buildCalldataFromBest(
                to,
                false,
                r.mid2,
                tokenOut,
                0,
                SlippageLib.limit(false, r.c.amountOut, slippageBps),
                slippageBps,
                deadline,
                r.c,
                omitSwapAmountForBuildingCalldata
            );

            b = r.b;
            c = r.c;
            multicall = _mc(calls);
        }
    }

    /// @dev Build calldata for any AMM type including Curve, using a pre-computed quote.
    function _buildCalldataFromBest(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 slippageBps,
        uint256 deadline,
        Quote memory q,
        bool omitSwapAmountForBuildingCalldata
    ) internal view returns (bytes memory) {
        // Default: V2/V3/V4/ZAMM (V4_HOOKED calldata is built inline by callers)
        return
            _buildSwapFromQuote(
                to,
                exactOut,
                tokenIn,
                tokenOut,
                swapAmount,
                amountLimit,
                deadline,
                q,
                omitSwapAmountForBuildingCalldata
            );
    }

    // ====================== SPLIT ROUTING ======================

    /// @notice Build a split swap that divides the input across 2 venues for better execution.
    ///         ExactIn only. Tries splits [100/0, 75/25, 50/50, 25/75, 0/100] across the
    ///         top 2 venues and picks the best total output.
    function buildSplitSwap(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 slippageBps,
        uint256 deadline,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (Quote[2] memory legs, bytes memory multicall, uint256 msgValue)
    {
        return
            buildSplitSwapHooked(
                to,
                tokenIn,
                tokenOut,
                swapAmount,
                slippageBps,
                deadline,
                0,
                0,
                address(0),
                omitSwapAmountForBuildingCalldata
            );
    }

    // ====================== HYBRID SPLIT (single-hop + 2-hop) ======================

    /// @notice Build a hybrid split that routes part of the input through the best
    ///         single-hop venue and the remainder through the best 2-hop route (via a
    ///         hub token). This captures cases where splitting across route depths
    ///         beats any single strategy.
    ///         Returns the same shape as buildSplitSwap for frontend compatibility.
    function buildHybridSplit(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 slippageBps,
        uint256 deadline,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (Quote[2] memory legs, bytes memory multicall, uint256 msgValue)
    {
        unchecked {
            // --- 1. Best single-hop at full amount ---
            Quote memory directFull = _quoteBestSingleHop(
                false,
                tokenIn,
                tokenOut,
                swapAmount
            );

            // --- 2. Best 2-hop hub route at full amount ---
            address[5] memory HUBS = _hubs();
            address bestHub;
            Quote memory hop1Full;
            Quote memory hop2Full;
            uint256 bestTwoHopOut;

            for (uint256 i; i < HUBS.length; ++i) {
                address mid = HUBS[i];
                if (mid == tokenIn || mid == tokenOut) continue;

                Quote memory qa = _quoteBestSingleHop(
                    false,
                    tokenIn,
                    mid,
                    swapAmount
                );

                uint256 midAmt = SlippageLib.limit(
                    false,
                    qa.amountOut,
                    slippageBps
                );
                Quote memory qb = _quoteBestSingleHop(
                    false,
                    mid,
                    tokenOut,
                    midAmt
                );
                if (qb.amountOut == 0) continue;

                if (qb.amountOut > bestTwoHopOut) {
                    bestTwoHopOut = qb.amountOut;
                    bestHub = mid;
                    hop1Full = qa;
                    hop2Full = qb;
                }
            }

            // Need at least one strategy
            if (directFull.amountOut == 0 && bestTwoHopOut == 0)
                revert NoRoute();

            // --- 3. Try hybrid splits [75/25, 50/50, 25/75] in both directions ---
            uint256[3] memory directPcts = [uint256(75), 50, 25];
            uint256 bestTotalOut;
            uint256 bestSplitIdx; // 0-2 = directPcts[i], 3-5 = (100-directPcts[i])
            // Also compare pure strategies
            if (directFull.amountOut >= bestTwoHopOut) {
                bestTotalOut = directFull.amountOut;
                bestSplitIdx = 6; // sentinel: 100% direct
            } else {
                bestTotalOut = bestTwoHopOut;
                bestSplitIdx = 7; // sentinel: 100% 2-hop
            }

            for (uint256 s; s < 3; ++s) {
                uint256 directAmt = (swapAmount * directPcts[s]) / 100;
                uint256 twoHopAmt = swapAmount - directAmt;

                // Re-quote direct leg at partial amount
                Quote memory qd = _requoteForSource(
                    false,
                    tokenIn,
                    tokenOut,
                    directAmt,
                    directFull
                );
                if (qd.amountOut == 0) continue;

                // Re-quote 2-hop: leg1 at partial, leg2 on leg1's output
                Quote memory qh1 = _requoteForSource(
                    false,
                    tokenIn,
                    bestHub,
                    twoHopAmt,
                    hop1Full
                );
                if (qh1.amountOut == 0) continue;
                uint256 midAmt = SlippageLib.limit(
                    false,
                    qh1.amountOut,
                    slippageBps
                );
                Quote memory qh2 = _quoteBestSingleHop(
                    false,
                    bestHub,
                    tokenOut,
                    midAmt
                );
                if (qh2.amountOut == 0) continue;

                uint256 total = qd.amountOut + qh2.amountOut;
                if (total > bestTotalOut) {
                    bestTotalOut = total;
                    bestSplitIdx = s;
                }
            }

            // --- 4. Build the winning multicall ---
            if (bestSplitIdx == 6) {
                // 100% direct wins
                legs[0] = directFull;
                (, bytes memory cd, , uint256 mv) = buildBestSwap(
                    to,
                    false,
                    tokenIn,
                    tokenOut,
                    swapAmount,
                    slippageBps,
                    deadline,
                    omitSwapAmountForBuildingCalldata
                );
                bytes[] memory calls_ = new bytes[](1);
                calls_[0] = cd;
                multicall = _mc(calls_);
                msgValue = mv;
            } else if (bestSplitIdx == 7) {
                // 100% 2-hop wins
                legs[1] = _asQuote(hop2Full.source, swapAmount, bestTwoHopOut);
                (, bytes memory cd1, , uint256 mv) = buildBestSwap(
                    ZROUTER,
                    false,
                    tokenIn,
                    bestHub,
                    swapAmount,
                    slippageBps,
                    deadline,
                    omitSwapAmountForBuildingCalldata
                );
                Quote memory qb2 = _quoteBestSingleHop(
                    false,
                    bestHub,
                    tokenOut,
                    SlippageLib.limit(false, hop1Full.amountOut, slippageBps)
                );
                bytes memory cd2 = _buildCalldataFromBest(
                    to,
                    false,
                    bestHub,
                    tokenOut,
                    0,
                    SlippageLib.limit(false, qb2.amountOut, slippageBps),
                    slippageBps,
                    deadline,
                    qb2,
                    omitSwapAmountForBuildingCalldata
                );
                bytes[] memory calls_ = new bytes[](2);
                calls_[0] = cd1;
                calls_[1] = cd2;
                multicall = _mc(calls_);
                msgValue = mv;
            } else {
                // True hybrid split
                uint256 directAmt = (swapAmount * directPcts[bestSplitIdx]) /
                    100;
                uint256 twoHopAmt = swapAmount - directAmt;

                // Re-quote final amounts for both strategies
                Quote memory qd = _requoteForSource(
                    false,
                    tokenIn,
                    tokenOut,
                    directAmt,
                    directFull
                );
                Quote memory qh1 = _requoteForSource(
                    false,
                    tokenIn,
                    bestHub,
                    twoHopAmt,
                    hop1Full
                );
                if (qd.amountOut == 0 || qh1.amountOut == 0) revert NoRoute();
                uint256 midAmt = SlippageLib.limit(
                    false,
                    qh1.amountOut,
                    slippageBps
                );
                Quote memory qh2 = _quoteBestSingleHop(
                    false,
                    bestHub,
                    tokenOut,
                    midAmt
                );
                if (qh2.amountOut == 0) revert NoRoute();

                legs[0] = qd;
                legs[1] = _asQuote(qh2.source, twoHopAmt, qh2.amountOut);

                bool ethIn = tokenIn == address(0);
                address legTo = ethIn ? ZROUTER : to;

                // Direct leg calldata
                uint256 directLimit = SlippageLib.limit(
                    false,
                    qd.amountOut,
                    slippageBps
                );
                bool wrapDirect = false;
                bytes memory cdDirect = _buildCalldataFromBest(
                    legTo,
                    false,
                    tokenIn,
                    tokenOut,
                    directAmt,
                    directLimit,
                    slippageBps,
                    deadline,
                    qd,
                    omitSwapAmountForBuildingCalldata
                );

                // 2-hop leg calldata: hop1 to ZROUTER, hop2 reads balance (swapAmount=0)
                uint256 hop1Limit = SlippageLib.limit(
                    false,
                    qh1.amountOut,
                    slippageBps
                );
                bool wrapHop1 = false;
                bytes memory cdHop1 = _buildCalldataFromBest(
                    ZROUTER,
                    false,
                    tokenIn,
                    bestHub,
                    twoHopAmt,
                    hop1Limit,
                    slippageBps,
                    deadline,
                    qh1,
                    omitSwapAmountForBuildingCalldata
                );
                uint256 hop2Limit = SlippageLib.limit(
                    false,
                    qh2.amountOut,
                    slippageBps
                );
                bytes memory cdHop2 = _buildCalldataFromBest(
                    legTo,
                    false,
                    bestHub,
                    tokenOut,
                    0,
                    hop2Limit,
                    slippageBps,
                    deadline,
                    qh2,
                    omitSwapAmountForBuildingCalldata
                );

                // Assemble multicall
                // Calls: [wrap?] direct [wrap?] hop1 hop2 [sweep tokenOut] [sweep ETH]
                uint256 numCalls = 3 +
                    (ethIn ? 2 : 0) +
                    (wrapDirect ? 1 : 0) +
                    (wrapHop1 ? 1 : 0);
                bytes[] memory calls_ = new bytes[](numCalls);
                uint256 ci;

                if (wrapDirect) {
                    calls_[ci++] = _wrap(directAmt);
                }
                if (wrapDirect)
                    assembly ("memory-safe") {
                        mstore(add(cdDirect, 100), WETH)
                    }
                calls_[ci++] = cdDirect;

                if (wrapHop1) {
                    calls_[ci++] = _wrap(twoHopAmt);
                }
                if (wrapHop1)
                    assembly ("memory-safe") {
                        mstore(add(cdHop1, 100), WETH)
                    }
                calls_[ci++] = cdHop1;

                calls_[ci++] = cdHop2;

                if (ethIn) {
                    calls_[ci++] = _sweepTo(tokenOut, to);
                    calls_[ci++] = _sweepTo(address(0), to);
                }

                multicall = _mc(calls_);
                msgValue = ethIn ? swapAmount : 0;
            }
        }
    }

    // ====================== V4 HOOKED SPLIT ======================

    /// @dev Quote V4 hooked pool, returning 0 on failure.
    ///      quoteV4 simulates raw AMM math only — it does NOT simulate the hook's
    ///      afterSwap callback which can modify the swap delta (e.g. protocol fees).
    ///      We reduce the output by the hook's afterSwap fee so that slippage limits
    ///      and venue comparisons reflect the real post-fee amount.
    function _tryQuoteV4Hooked(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint24 fee,
        int24 tick,
        address hook
    ) internal view returns (uint256 out) {
        try
            _BASE.quoteV4(false, tokenIn, tokenOut, fee, tick, hook, amount)
        returns (uint256, uint256 o) {
            out = o;
        } catch {
            return 0;
        }
        // Deduct hook's afterSwap fee (immutable in deployed hook).
        if (hook == 0xfAaad5B731F52cDc9746F2414c823eca9B06E844) {
            out = (out * 9000) / 10000; // PNKSTR: feeBips=1000 (10%)
        }
    }

    /// @dev Build execute(V4_ROUTER) calldata for a V4 hooked pool swap (ETH input only).
    function _buildV4HookedCalldata(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline,
        uint24 hookPoolFee,
        int24 hookTickSpacing,
        address hookAddress
    ) internal pure returns (bytes memory) {
        // Sort tokens for the V4 pool key (currency0 < currency1)
        (address c0, address c1) = tokenIn < tokenOut
            ? (tokenIn, tokenOut)
            : (tokenOut, tokenIn);
        bool zeroForOne = tokenIn == c0;
        bytes memory swapData = abi.encodeWithSelector(
            IV4Router.swapExactTokensForTokens.selector,
            swapAmount,
            amountLimit,
            zeroForOne,
            IV4PoolKey(c0, c1, hookPoolFee, hookTickSpacing, hookAddress),
            "",
            to,
            deadline
        );
        return
            abi.encodeWithSelector(
                IZRouter.execute.selector,
                V4_ROUTER,
                swapAmount,
                swapData
            );
    }

    /// @notice Build a split swap that includes a V4 hooked pool as a candidate.
    ///         ExactIn only. Gathers standard venues + Curve + the hooked pool,
    ///         finds the top 2, tries splits [100/0, 75/25, 50/50, 25/75, 0/100],
    ///         and returns the optimal multicall.
    function buildSplitSwapHooked(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 slippageBps,
        uint256 deadline,
        uint24 hookPoolFee,
        int24 hookTickSpacing,
        address hookAddress,
        bool omitSwapAmountForBuildingCalldata
    )
        public
        view
        returns (Quote[2] memory legs, bytes memory multicall, uint256 msgValue)
    {
        unchecked {
            // ---- Gather candidates ----
            // Filter out WETH_WRAP.
            (, Quote[] memory baseQuotes) = getQuotes(
                false,
                tokenIn,
                tokenOut,
                swapAmount
            );
            uint256 n;
            Quote[] memory cands = new Quote[](baseQuotes.length + 2);
            for (uint256 i; i < baseQuotes.length; ++i) {
                if (baseQuotes[i].source == AMM.WETH_WRAP) {
                    continue;
                }
                cands[n++] = baseQuotes[i];
            }

            // V4 Hooked — ETH input only (ERC20 input hits Unauthorized on V4_ROUTER)
            uint256 hIdx = type(uint256).max;
            if (tokenIn == address(0)) {
                uint256 ho_ = _tryQuoteV4Hooked(
                    tokenIn,
                    tokenOut,
                    swapAmount,
                    hookPoolFee,
                    hookTickSpacing,
                    hookAddress
                );
                if (ho_ > 0) {
                    hIdx = n;
                    cands[n] = Quote(AMM.V4_HOOKED, 0, swapAmount, ho_);
                    n++;
                }
            }

            // ---- Top 2 ----
            uint256 idx1;
            uint256 idx2;
            uint256 out1;
            uint256 out2;
            for (uint256 i; i < n; ++i) {
                if (cands[i].amountOut > out1) {
                    out2 = out1;
                    idx2 = idx1;
                    out1 = cands[i].amountOut;
                    idx1 = i;
                } else if (cands[i].amountOut > out2) {
                    out2 = cands[i].amountOut;
                    idx2 = i;
                }
            }
            if (out1 == 0) revert NoRoute();

            bool ethIn = tokenIn == address(0);

            // ---- Single venue fallback ----
            if (out2 == 0 || idx1 == idx2) {
                legs[0] = cands[idx1];
                if (idx1 == hIdx) {
                    uint256 lim = SlippageLib.limit(
                        false,
                        legs[0].amountOut,
                        slippageBps
                    );
                    multicall = _mc1(
                        _buildV4HookedCalldata(
                            to,
                            tokenIn,
                            tokenOut,
                            swapAmount,
                            lim,
                            deadline,
                            hookPoolFee,
                            hookTickSpacing,
                            hookAddress
                        )
                    );
                    msgValue = ethIn ? swapAmount : 0;
                } else {
                    (, bytes memory cd, , uint256 mv) = buildBestSwap(
                        to,
                        false,
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        slippageBps,
                        deadline,
                        omitSwapAmountForBuildingCalldata
                    );
                    multicall = _mc1(cd);
                    msgValue = mv;
                }
                return (legs, multicall, msgValue);
            }

            // ---- Try splits ----
            bool v1h = (idx1 == hIdx);
            bool v2h = (idx2 == hIdx);
            Quote memory venue1 = cands[idx1];
            Quote memory venue2 = cands[idx2];

            uint256[5] memory pcts = [uint256(100), 75, 50, 25, 0];
            uint256 bestTotal;
            uint256 bestS;

            for (uint256 s; s < 5; ++s) {
                uint256 a1 = (swapAmount * pcts[s]) / 100;
                uint256 a2 = swapAmount - a1;
                uint256 o1_;
                uint256 o2_;

                if (a1 > 0) {
                    o1_ = v1h
                        ? _tryQuoteV4Hooked(
                            tokenIn,
                            tokenOut,
                            a1,
                            hookPoolFee,
                            hookTickSpacing,
                            hookAddress
                        )
                        : _requoteForSource(
                            false,
                            tokenIn,
                            tokenOut,
                            a1,
                            venue1
                        ).amountOut;
                }
                if (a2 > 0) {
                    o2_ = v2h
                        ? _tryQuoteV4Hooked(
                            tokenIn,
                            tokenOut,
                            a2,
                            hookPoolFee,
                            hookTickSpacing,
                            hookAddress
                        )
                        : _requoteForSource(
                            false,
                            tokenIn,
                            tokenOut,
                            a2,
                            venue2
                        ).amountOut;
                }

                uint256 t = o1_ + o2_;
                if (t > bestTotal) {
                    bestTotal = t;
                    bestS = s;
                }
            }

            // ---- Build winning split ----
            uint256 fa1 = (swapAmount * pcts[bestS]) / 100;
            uint256 fa2 = swapAmount - fa1;

            if (fa1 == 0 || fa2 == 0) {
                // 100/0 or 0/100 — single venue
                uint256 winner = fa1 == 0 ? 1 : 0;
                bool wh = winner == 0 ? v1h : v2h;
                if (wh) {
                    uint256 ho_ = _tryQuoteV4Hooked(
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        hookPoolFee,
                        hookTickSpacing,
                        hookAddress
                    );
                    legs[winner] = Quote(AMM.V4_HOOKED, 0, swapAmount, ho_);
                    uint256 lim = SlippageLib.limit(false, ho_, slippageBps);
                    multicall = _mc1(
                        _buildV4HookedCalldata(
                            to,
                            tokenIn,
                            tokenOut,
                            swapAmount,
                            lim,
                            deadline,
                            hookPoolFee,
                            hookTickSpacing,
                            hookAddress
                        )
                    );
                    msgValue = ethIn ? swapAmount : 0;
                } else {
                    Quote memory v = winner == 0 ? venue1 : venue2;
                    legs[winner] = _requoteForSource(
                        false,
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        v
                    );
                    (, bytes memory cd, , uint256 mv) = buildBestSwap(
                        to,
                        false,
                        tokenIn,
                        tokenOut,
                        swapAmount,
                        slippageBps,
                        deadline,
                        omitSwapAmountForBuildingCalldata
                    );
                    multicall = _mc1(cd);
                    msgValue = mv;
                }
                return (legs, multicall, msgValue);
            }

            // ---- True split: build both legs ----
            if (v1h) {
                uint256 ho_ = _tryQuoteV4Hooked(
                    tokenIn,
                    tokenOut,
                    fa1,
                    hookPoolFee,
                    hookTickSpacing,
                    hookAddress
                );
                legs[0] = Quote(AMM.V4_HOOKED, 0, fa1, ho_);
            } else {
                legs[0] = _requoteForSource(
                    false,
                    tokenIn,
                    tokenOut,
                    fa1,
                    venue1
                );
            }
            if (v2h) {
                uint256 ho_ = _tryQuoteV4Hooked(
                    tokenIn,
                    tokenOut,
                    fa2,
                    hookPoolFee,
                    hookTickSpacing,
                    hookAddress
                );
                legs[1] = Quote(AMM.V4_HOOKED, 0, fa2, ho_);
            } else {
                legs[1] = _requoteForSource(
                    false,
                    tokenIn,
                    tokenOut,
                    fa2,
                    venue2
                );
            }

            // Guard: if re-quote at partial amount returns zero, revert so frontend
            // falls through to a non-split strategy instead of building bad calldata.
            if (legs[0].amountOut == 0 || legs[1].amountOut == 0)
                revert NoRoute();

            uint256 lim1 = SlippageLib.limit(
                false,
                legs[0].amountOut,
                slippageBps
            );
            uint256 lim2 = SlippageLib.limit(
                false,
                legs[1].amountOut,
                slippageBps
            );

            address legTo = ethIn ? ZROUTER : to;

            // Curve legs with ETH input need a pre-wrap (since we dont support Curve, just dont warp)
            bool wrapLeg1 = false;
            bool wrapLeg2 = false;
            uint256 nc = 2 +
                (ethIn ? 2 : 0) +
                (wrapLeg1 ? 1 : 0) +
                (wrapLeg2 ? 1 : 0);
            bytes[] memory calls_ = new bytes[](nc);
            uint256 ci;

            // Leg 1
            if (wrapLeg1) {
                calls_[ci++] = _wrap(fa1);
            }
            if (v1h) {
                calls_[ci++] = _buildV4HookedCalldata(
                    legTo,
                    tokenIn,
                    tokenOut,
                    fa1,
                    lim1,
                    deadline,
                    hookPoolFee,
                    hookTickSpacing,
                    hookAddress
                );
            } else {
                bytes memory cd1 = _buildCalldataFromBest(
                    legTo,
                    false,
                    tokenIn,
                    tokenOut,
                    fa1,
                    lim1,
                    slippageBps,
                    deadline,
                    legs[0],
                    omitSwapAmountForBuildingCalldata
                );
                if (wrapLeg1)
                    assembly ("memory-safe") {
                        mstore(add(cd1, 100), WETH)
                    }
                calls_[ci++] = cd1;
            }

            // Leg 2
            if (wrapLeg2) {
                calls_[ci++] = _wrap(fa2);
            }
            if (v2h) {
                calls_[ci++] = _buildV4HookedCalldata(
                    legTo,
                    tokenIn,
                    tokenOut,
                    fa2,
                    lim2,
                    deadline,
                    hookPoolFee,
                    hookTickSpacing,
                    hookAddress
                );
            } else {
                bytes memory cd2 = _buildCalldataFromBest(
                    legTo,
                    false,
                    tokenIn,
                    tokenOut,
                    fa2,
                    lim2,
                    slippageBps,
                    deadline,
                    legs[1],
                    omitSwapAmountForBuildingCalldata
                );
                if (wrapLeg2)
                    assembly ("memory-safe") {
                        mstore(add(cd2, 100), WETH)
                    }
                calls_[ci++] = cd2;
            }

            // Final sweeps for ETH input
            if (ethIn) {
                calls_[ci++] = _sweepTo(tokenOut, to);
                // Sweep any leftover ETH dust (prevents stealable balance in router)
                calls_[ci++] = _sweepTo(address(0), to);
            }

            multicall = _mc(calls_);
            msgValue = ethIn ? swapAmount : 0;
        }
    }

    /// @dev Re-quote for a specific AMM source at a given amount.
    function _requoteForSource(
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        Quote memory source
    ) internal view returns (Quote memory q) {
        AMM src = source.source;
        uint256 fee = source.feeBps;
        uint256 ai;
        uint256 ao;
        if (src == AMM.UNI_V2) {
            (ai, ao) = _BASE.quoteV2(exactOut, tokenIn, tokenOut, amount);
            fee = 30;
        } else if (src == AMM.UNI_V3) {
            (ai, ao) = _BASE.quoteV3(
                exactOut,
                tokenIn,
                tokenOut,
                uint24(fee * 100),
                amount
            );
        } else if (src == AMM.UNI_V4) {
            (ai, ao) = _BASE.quoteV4(
                exactOut,
                tokenIn,
                tokenOut,
                uint24(fee * 100),
                _spacingFromBps(uint16(fee)),
                address(0),
                amount
            );
        } else if (src == AMM.ZAMM) {
            (ai, ao) = _BASE.quoteZAMM(
                exactOut,
                fee,
                tokenIn,
                tokenOut,
                0,
                0,
                amount
            );
        } else {
            (q, ) = getQuotes(exactOut, tokenIn, tokenOut, amount);
            return q;
        }
        return Quote(src, fee, ai, ao);
    }
}

function _sortTokens(
    address tokenA,
    address tokenB
) pure returns (address token0, address token1, bool zeroForOne) {
    (token0, token1) = (zeroForOne = tokenA < tokenB)
        ? (tokenA, tokenB)
        : (tokenB, tokenA);
}

address constant WETH = 0x4200000000000000000000000000000000000006;
address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
address constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;
address constant DAI = 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb;
address constant WBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf; // using cbWbtc as it has more liquidity

interface IStETH {
    function getTotalShares() external view returns (uint256);

    function getTotalPooledEther() external view returns (uint256);
}

address constant ZROUTER = 0x06f159ff41Aa2f3777E6B504242cAB18bB60dFe4;
address constant V4_ROUTER = 0x00000000000044a361Ae3cAc094c9D1b14Eece97; // Same for ETH and BASE

struct IV4PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

interface IV4Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        IV4PoolKey calldata poolKey,
        bytes calldata hookData,
        address to,
        uint256 deadline
    ) external payable returns (int256);
}

interface IRouterExt {
    function unwrap(uint256 amount) external payable;

    function wrap(uint256 amount) external payable;

    function deposit(
        address token,
        uint256 id,
        uint256 amount
    ) external payable;

    function multicall(
        bytes[] calldata data
    ) external payable returns (bytes[] memory);

    function sweep(
        address token,
        uint256 id,
        uint256 amount,
        address to
    ) external payable;
}

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

interface IZRouter {
    function swapV2(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function swapVZ(
        address to,
        bool exactOut,
        uint256 feeOrHook,
        address tokenIn,
        address tokenOut,
        uint256 idIn,
        uint256 idOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function swapV3(
        address to,
        bool exactOut,
        uint24 swapFee,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function swapV4(
        address to,
        bool exactOut,
        uint24 swapFee,
        int24 tickSpace,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory result);
}
