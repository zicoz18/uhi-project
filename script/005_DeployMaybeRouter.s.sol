// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {MaybeRouter} from "../../src/MaybeRouter.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {IMaybeToken} from "../src/interfaces/IMaybeToken.sol";
import {IMaybeHook} from "../src/interfaces/IMaybeHook.sol";
import {IzRouter} from "zRouter/src/IzRouter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IVRFV2PlusWrapper} from "chainlink/vrf/dev/interfaces/IVRFV2PlusWrapper.sol";

contract DeployMaybeRouterScript is Script {
    using CurrencyLibrary for Currency;

    function run() public {
        uint24 lpFee = 100; // 0.01% (100)
        int24 tickSpacing = 60;

        IPoolManager pm = IPoolManager(
            0x498581fF718922c3f8e6A244956aF099B2652b2b
        );

        string memory maybeTokenJson = vm.readFile("deployments/MaybeToken.json");
        IMaybeToken maybeToken = IMaybeToken(
            vm.parseJsonAddress(maybeTokenJson, ".MaybeToken")
        );

        string memory maybeZRouterJson = vm.readFile("deployments/MaybeZRouter.json");
        IzRouter maybeZRouter = IzRouter(
            vm.parseJsonAddress(maybeZRouterJson, ".MaybeZRouter")
        );

        string memory maybeHookJson = vm.readFile("deployments/MaybeHook.json");
        IMaybeHook maybeHook = IMaybeHook(
            vm.parseJsonAddress(maybeHookJson, ".MaybeHook")
        );

        vm.startBroadcast();
        MaybeRouter maybeRouter = new MaybeRouter(
            pm,
            maybeToken,
            maybeZRouter,
            PoolKey({
                currency0: Currency.wrap(address(0)), // ETH
                currency1: Currency.wrap(address(maybeToken)),
                fee: lpFee,
                tickSpacing: tickSpacing,
                hooks: IHooks(address(maybeHook))
            })
        );
        vm.stopBroadcast();

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeRouter",
            address(maybeRouter)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        vm.writeJson(json, "deployments/MaybeRouter.json");
    }
}
