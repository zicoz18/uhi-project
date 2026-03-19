// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {MaybeZRouter} from "../../src/zFiForBase/MaybeZRouter.sol";

/// @notice Mines the address and deploys the Counter.sol Hook contract
contract DeployMaybeZRouterScript is Script {
    function run() public {
        // Deploy the MaybeZRouter
        vm.startBroadcast();
        MaybeZRouter maybeZRouter = new MaybeZRouter();
        vm.stopBroadcast();

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeZRouter",
            address(maybeZRouter)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        string memory path = string.concat(
            "deployments/",
            vm.toString(block.chainid),
            ".json"
        );
        vm.writeJson(json, path);
    }
}
