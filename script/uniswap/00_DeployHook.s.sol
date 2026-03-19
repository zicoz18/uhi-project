// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "../base/BaseScript.sol";

import {MaybeHook} from "../../src/MaybeHook.sol";

import {IMaybeToken} from "../../src/interfaces/IMaybeToken.sol";
import {IzRouter} from "zRouter/src/IzRouter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @notice Mines the address and deploys the Counter.sol Hook contract
contract DeployHookScript is BaseScript {
    function run() public {
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG |
                Hooks.AFTER_SWAP_FLAG |
                Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        address owner = 0xd264532bB799a551Ba8BBeDd15356C496Eb18954;
        IPoolManager pm = IPoolManager(
            0x498581fF718922c3f8e6A244956aF099B2652b2b
        );
        IMaybeToken maybeToken = IMaybeToken(
            0xfA445199d5AA54E1b8E5d8D93492743425ce5D21
        );
        IzRouter maybeZRouter = IzRouter(
            0x06f159ff41Aa2f3777E6B504242cAB18bB60dFe4
        );
        uint256 protocolFeeInBps = 100;
        uint256 lpFeeShareInBps = 100;
        uint256 vrfTimeoutInSeconds = 60;
        uint16 vrfMinimumRequestConfirmation = 0;
        uint256 vrfWrapperOverhead = 13400;
        uint256 vrfCoordinatorNativeOverhead = 128500;
        uint256 vrfCoordinatorNativeOverheadPerWord = 435;
        uint32 vrfCallbackGasLimitEthMaxValue = 2_500_000;
        uint32 vrfCallbackGasLimit = uint32(
            vrfCallbackGasLimitEthMaxValue -
                vrfWrapperOverhead -
                vrfCoordinatorNativeOverhead -
                vrfCoordinatorNativeOverheadPerWord
        );
        address vrfWrapper = 0xb0407dbe851f8318bd31404A49e658143C982F23;

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(
            owner,
            pm,
            maybeToken,
            maybeZRouter,
            protocolFeeInBps,
            lpFeeShareInBps,
            vrfTimeoutInSeconds,
            vrfMinimumRequestConfirmation,
            vrfCallbackGasLimit,
            vrfWrapper
        );
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(MaybeHook).creationCode,
            constructorArgs
        );

        // Deploy the hook using CREATE2
        vm.startBroadcast();
        MaybeHook maybeHook = new MaybeHook{salt: salt}(
            owner,
            pm,
            maybeToken,
            maybeZRouter,
            protocolFeeInBps,
            lpFeeShareInBps,
            vrfTimeoutInSeconds,
            vrfMinimumRequestConfirmation,
            vrfCallbackGasLimit,
            vrfWrapper
        );
        vm.stopBroadcast();

        require(
            address(maybeHook) == hookAddress,
            "DeployMaybeHookScript: Hook Address Mismatch"
        );

        string memory json = vm.serializeAddress(
            "deployment",
            "MaybeHook",
            address(maybeHook)
        );
        json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeUint("deployment", "blockNumber", block.number);

        vm.writeJson(json, "deployments/MaybeHook.json");
    }
}
