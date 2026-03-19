// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {MaybeToken} from "../../src/MaybeToken.sol";

contract DeployMaybeTokenScript is Script {
    function run() public {
        // Deploy the MaybeToken
        vm.startBroadcast();
        MaybeToken maybeToken = new MaybeToken(
            address(0xd264532bB799a551Ba8BBeDd15356C496Eb18954)
        );
        vm.stopBroadcast();

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeToken",
            address(maybeToken)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        vm.writeJson(json, "deployments/MaybeToken.json");
    }
}
