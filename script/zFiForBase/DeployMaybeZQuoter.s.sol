// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {MaybeZQuoter} from "../../src/zFiForBase/MaybeZQuoter.sol";

/// @notice Mines the address and deploys the Counter.sol Hook contract
contract DeployMaybeZQuoterScript is Script {
    function run() public {
        // Deploy the MaybeZQuoter
        vm.startBroadcast();
        MaybeZQuoter maybeZQuoter = new MaybeZQuoter();
        vm.stopBroadcast();

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeZQuoter",
            address(maybeZQuoter)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        vm.writeJson(json, "deployments/MaybeZQuoter.json");
    }
}
