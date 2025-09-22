// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @dev Mock USDT contract for testing purposes
 * This contract mimics USDT with 6 decimals like the real USDT
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private _decimals = 6; // USDT has 6 decimals

    constructor() ERC20("Mock USDT", "USDT") {
        // Mint initial supply to deployer (1 million USDT)
        _mint(msg.sender, 1000000 * 10**_decimals);
    }

    /**
     * @dev Override decimals to return 6 (like real USDT)
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint new tokens (for testing purposes)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (with 6 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Faucet function for testing - anyone can get free USDT
     * @param amount Amount to mint (with 6 decimals)
     */
    function faucet(uint256 amount) external {
        require(amount <= 10000 * 10**_decimals, "Cannot mint more than 10,000 USDT at once");
        _mint(msg.sender, amount);
    }

    /**
     * @dev Get free USDT for testing (simplified faucet)
     */
    function getTestUSDT() external {
        _mint(msg.sender, 1000 * 10**_decimals); // 1,000 USDT
    }
}