// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {IMaybeToken} from "../../src/interfaces/IMaybeToken.sol";

contract GiveMaybeHookMinterRole is Script {
    function run() public {
        string memory maybeTokenJson = vm.readFile("deployments/MaybeToken.json");
        IMaybeToken maybeToken = IMaybeToken(
            vm.parseJsonAddress(maybeTokenJson, ".MaybeToken")
        );

        string memory maybeHookJson = vm.readFile("deployments/MaybeHook.json");
        address maybeHookAddress = vm.parseJsonAddress(maybeHookJson, ".MaybeHook");

        bytes32 minterRole = maybeToken.MINTER_ROLE();
        vm.startBroadcast();
        maybeToken.grantRole(minterRole, maybeHookAddress);
        vm.stopBroadcast();
    }
}
