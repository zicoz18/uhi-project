// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {MaybeZQuoterBase} from "../../src/zFiForBase/MaybeZQuoterBase.sol";

/// @notice Mines the address and deploys the Counter.sol Hook contract
contract DeployMaybeZQuoterBaseScript is Script {
    function run() public {
        // Deploy the MaybeZQuoterBase
        vm.startBroadcast();
        MaybeZQuoterBase maybeZQuoterBase = new MaybeZQuoterBase();
        vm.stopBroadcast();

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeZQuoterBase",
            address(maybeZQuoterBase)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        vm.writeJson(json, "deployments/MaybeZQuoterBase.json");
    }
}
