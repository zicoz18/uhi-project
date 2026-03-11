// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IMaybeHook {
    function vrfCallbackGasLimit() external view returns (uint32);

    function latestRegisteredMaybifyId() external view returns (uint256);
}
