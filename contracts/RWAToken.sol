// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title RWAToken
 * @dev ERC20 token representing fractional claims on real-world assets
 * Each token represents a claim on pledged collateral at a discount (e.g., 65-70% of asset value)
 */
contract RWAToken is ERC20, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant PLEDGE_MANAGER_ROLE = keccak256("PLEDGE_MANAGER_ROLE");

    // Asset information structure
    struct AssetInfo {
        string assetType; // "real_estate", "stocks", "bonds", etc.
        string description;
        uint256 originalValue; // Original asset value in USD (scaled by 1e18)
        uint256 pledgedValue; // Discounted value (e.g., 70% of original)
        string assetId; // External identifier for the asset
        address pledger; // Address of the asset owner who pledged
        uint256 pledgeTimestamp;
        bool isActive;
    }

    // Mapping from token ID to asset information
    mapping(uint256 => AssetInfo) public assets;
    
    // Mapping from asset ID to token ID
    mapping(string => uint256) public assetIdToTokenId;
    
    // Current token ID counter
    uint256 private _currentTokenId;
    
    // Total value of all pledged assets
    uint256 public totalPledgedValue;
    
    // Discount rate (e.g., 70 means 70% of original value)
    uint256 public discountRate = 70;

    event AssetPledged(
        uint256 indexed tokenId,
        string indexed assetId,
        address indexed pledger,
        string assetType,
        uint256 originalValue,
        uint256 pledgedValue,
        uint256 tokensIssued
    );

    event AssetReleased(
        uint256 indexed tokenId,
        string indexed assetId,
        address indexed pledger,
        uint256 tokensRedeemed
    );

    event DiscountRateUpdated(uint256 oldRate, uint256 newRate);

    constructor(
        string memory name,
        string memory symbol,
        address admin
    ) ERC20(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(PLEDGE_MANAGER_ROLE, admin);
        _currentTokenId = 1;
    }

    /**
     * @dev Create tokens backed by a pledged asset
     * @param assetId External identifier for the asset
     * @param assetType Type of asset (real_estate, stocks, etc.)
     * @param description Human-readable description
     * @param originalValue Original value of the asset in USD (scaled by 1e18)
     * @param pledger Address of the asset owner
     */
    function pledgeAsset(
        string memory assetId,
        string memory assetType,
        string memory description,
        uint256 originalValue,
        address pledger
    ) external onlyRole(PLEDGE_MANAGER_ROLE) whenNotPaused nonReentrant {
        require(bytes(assetId).length > 0, "Asset ID cannot be empty");
        require(assetIdToTokenId[assetId] == 0, "Asset already pledged");
        require(pledger != address(0), "Invalid pledger address");
        require(originalValue > 0, "Asset value must be greater than 0");

        uint256 tokenId = _currentTokenId++;
        uint256 pledgedValue = (originalValue * discountRate) / 100;
        
        // Store asset information
        assets[tokenId] = AssetInfo({
            assetType: assetType,
            description: description,
            originalValue: originalValue,
            pledgedValue: pledgedValue,
            assetId: assetId,
            pledger: pledger,
            pledgeTimestamp: block.timestamp,
            isActive: true
        });

        assetIdToTokenId[assetId] = tokenId;
        totalPledgedValue += pledgedValue;

        // Mint tokens equal to pledged value (1 token = 1 USD)
        uint256 tokensToIssue = pledgedValue / 1e18;
        _mint(pledger, tokensToIssue);

        emit AssetPledged(
            tokenId,
            assetId,
            pledger,
            assetType,
            originalValue,
            pledgedValue,
            tokensToIssue
        );
    }

    /**
     * @dev Release a pledged asset and burn corresponding tokens
     * @param assetId External identifier for the asset
     * @param tokenHolder Address holding the tokens to burn
     * @param tokensToRedeem Amount of tokens to burn
     */
    function releaseAsset(
        string memory assetId,
        address tokenHolder,
        uint256 tokensToRedeem
    ) external onlyRole(PLEDGE_MANAGER_ROLE) whenNotPaused nonReentrant {
        uint256 tokenId = assetIdToTokenId[assetId];
        require(tokenId != 0, "Asset not found");
        require(assets[tokenId].isActive, "Asset is not active");
        require(balanceOf(tokenHolder) >= tokensToRedeem, "Insufficient token balance");

        // Burn the tokens
        _burn(tokenHolder, tokensToRedeem);

        // If all tokens for this asset are redeemed, mark as inactive
        uint256 expectedTokens = assets[tokenId].pledgedValue / 1e18;
        if (tokensToRedeem >= expectedTokens) {
            assets[tokenId].isActive = false;
            totalPledgedValue -= assets[tokenId].pledgedValue;
        }

        emit AssetReleased(tokenId, assetId, assets[tokenId].pledger, tokensToRedeem);
    }

    /**
     * @dev Update the discount rate for new pledges
     * @param newRate New discount rate (e.g., 70 for 70%)
     */
    function setDiscountRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRate > 0 && newRate <= 100, "Invalid discount rate");
        uint256 oldRate = discountRate;
        discountRate = newRate;
        emit DiscountRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Get asset information by asset ID
     * @param assetId External identifier for the asset
     */
    function getAssetByAssetId(string memory assetId) external view returns (AssetInfo memory) {
        uint256 tokenId = assetIdToTokenId[assetId];
        require(tokenId != 0, "Asset not found");
        return assets[tokenId];
    }

    /**
     * @dev Get asset information by token ID
     * @param tokenId Internal token ID
     */
    function getAssetByTokenId(uint256 tokenId) external view returns (AssetInfo memory) {
        require(tokenId > 0 && tokenId < _currentTokenId, "Invalid token ID");
        return assets[tokenId];
    }

    /**
     * @dev Pause all token operations
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause all token operations
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Override transfer to add pause functionality
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}