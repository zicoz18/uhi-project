// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {IMaybeToken} from "../../src/interfaces/IMaybeToken.sol";

contract MintMaybeTokenScript is Script {
    function run() public {
        string memory json = vm.readFile("deployments/MaybeToken.json");
        IMaybeToken maybeToken = IMaybeToken(
            vm.parseJsonAddress(json, ".MaybeToken")
        );
        address owner = 0xd264532bB799a551Ba8BBeDd15356C496Eb18954;
        vm.startBroadcast();
        maybeToken.mint(owner, 1e23);
        vm.stopBroadcast();
    }
}
