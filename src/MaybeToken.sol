// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IMaybeToken} from "./interfaces/IMaybeToken.sol";

import {ERC20, ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/// @dev MaybeToken is the core token that support minting and burning for Maybe Protocol
contract MaybeToken is
    ERC20,
    ERC20Burnable,
    AccessControlEnumerable,
    IMaybeToken
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address _owner) ERC20("MAYBE", "MAYBE") {
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(MINTER_ROLE, _owner);
    }

    function mint(address to, uint256 value) public onlyRole(MINTER_ROLE) {
        _mint(to, value);
    }

    function burn(uint256 value) public override(ERC20Burnable, IMaybeToken) {
        super.burn(value);
    }

    function burnFrom(
        address account,
        uint256 value
    ) public override(ERC20Burnable, IMaybeToken) {
        super.burnFrom(account, value);
    }
}
