// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

import {IMaybeToken} from "../../src/interfaces/IMaybeToken.sol";

contract GiveMaybeHookMinterRole is Script {
    function run() public {
        IMaybeToken maybeToken = IMaybeToken(
            address(0xfA445199d5AA54E1b8E5d8D93492743425ce5D21) // @TODO: Update after MaybeToken deployment
        );
        bytes32 minterRole = maybeToken.MINTER_ROLE();
        vm.startBroadcast();
        maybeToken.grantRole(
            minterRole,
            0x04f4CcA485013a5507C3c1bD7a6bEEb82B5C60Cc // @TODO: Update after MaybeHook deployment
        );
        vm.stopBroadcast();
    }
}
