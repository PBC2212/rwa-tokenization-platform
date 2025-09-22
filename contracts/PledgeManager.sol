// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./RWAToken.sol";

/**
 * @title PledgeManager
 * @dev Manages the complete pledge-to-token-to-investor flow
 * Handles the business logic for RWA tokenization platform
 */
contract PledgeManager is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");

    RWAToken public rwaToken;
    IERC20 public usdtToken; // USDT for payments

    struct PledgeAgreement {
        string agreementId;
        address client;
        string assetId;
        string assetType;
        string description;
        uint256 originalValue;
        uint256 discountedValue;
        uint256 tokensIssued;
        uint256 clientPayment; // Amount paid to client in USDT
        uint256 timestamp;
        PledgeStatus status;
        string documentHash; // IPFS hash of legal documents
    }

    struct InvestorPurchase {
        address investor;
        uint256 tokenAmount;
        uint256 usdtPaid;
        uint256 timestamp;
        string purchaseId;
    }

    enum PledgeStatus {
        PENDING,
        ACTIVE,
        REPAID,
        DEFAULTED,
        RELEASED
    }

    // Mappings
    mapping(string => PledgeAgreement) public pledgeAgreements;
    mapping(string => InvestorPurchase[]) public assetInvestors;
    mapping(address => string[]) public clientPledges;
    mapping(address => string[]) public investorPurchases;

    // Financial tracking
    uint256 public totalClientPayments;
    uint256 public totalInvestorPayments;
    uint256 public platformRevenue;
    uint256 public spreadPercentage = 15; // 15% spread (company profit)

    // Events
    event PledgeCreated(
        string indexed agreementId,
        address indexed client,
        string assetId,
        uint256 originalValue,
        uint256 discountedValue,
        uint256 clientPayment
    );

    event TokensPurchased(
        string indexed agreementId,
        address indexed investor,
        uint256 tokenAmount,
        uint256 usdtPaid,
        string purchaseId
    );

    event PledgeRepaid(
        string indexed agreementId,
        address indexed client,
        uint256 repaymentAmount
    );

    event ClientPaid(
        string indexed agreementId,
        address indexed client,
        uint256 amount
    );

    event SpreadUpdated(uint256 oldSpread, uint256 newSpread);

    constructor(
        address _rwaToken,
        address _usdtToken,
        address admin
    ) {
        require(_rwaToken != address(0), "Invalid RWA token address");
        require(_usdtToken != address(0), "Invalid USDT token address");
        require(admin != address(0), "Invalid admin address");
        
        rwaToken = RWAToken(_rwaToken);
        usdtToken = IERC20(_usdtToken);
        
        // Grant all roles to admin for development/testing
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(FINANCE_ROLE, admin);
        
        // Also grant roles to deployer if different from admin
        if (admin != msg.sender) {
            _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
            _grantRole(OPERATOR_ROLE, msg.sender);
            _grantRole(FINANCE_ROLE, msg.sender);
        }
    }

    /**
     * @dev Create a new pledge agreement and issue tokens
     * @param agreementId Unique identifier for the pledge agreement
     * @param client Address of the client pledging the asset
     * @param assetId External identifier for the asset
     * @param assetType Type of asset (real_estate, stocks, etc.)
     * @param description Human-readable description
     * @param originalValue Original value of the asset in USD (scaled by 1e18)
     * @param documentHash IPFS hash of legal documents
     */
    function createPledge(
        string memory agreementId,
        address client,
        string memory assetId,
        string memory assetType,
        string memory description,
        uint256 originalValue,
        string memory documentHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        require(bytes(agreementId).length > 0, "Agreement ID cannot be empty");
        require(client != address(0), "Invalid client address");
        require(originalValue > 0, "Asset value must be greater than 0");
        require(pledgeAgreements[agreementId].timestamp == 0, "Agreement already exists");

        // Calculate discounted value (using RWA token's discount rate)
        uint256 discountRate = rwaToken.discountRate();
        uint256 discountedValue = (originalValue * discountRate) / 100;
        
        // Calculate client payment (discounted value minus platform spread)
        uint256 clientPayment = (discountedValue * (100 - spreadPercentage)) / 100;
        
        // Create the pledge agreement
        pledgeAgreements[agreementId] = PledgeAgreement({
            agreementId: agreementId,
            client: client,
            assetId: assetId,
            assetType: assetType,
            description: description,
            originalValue: originalValue,
            discountedValue: discountedValue,
            tokensIssued: discountedValue / 1e18,
            clientPayment: clientPayment,
            timestamp: block.timestamp,
            status: PledgeStatus.PENDING,
            documentHash: documentHash
        });

        // Track client's pledges
        clientPledges[client].push(agreementId);

        // Pledge the asset and mint tokens to this contract
        rwaToken.pledgeAsset(assetId, assetType, description, originalValue, address(this));

        // Update status to active
        pledgeAgreements[agreementId].status = PledgeStatus.ACTIVE;

        emit PledgeCreated(agreementId, client, assetId, originalValue, discountedValue, clientPayment);
    }

    /**
     * @dev Pay the client immediately after pledge creation
     * @param agreementId The pledge agreement ID
     */
    function payClient(string memory agreementId) external onlyRole(FINANCE_ROLE) nonReentrant {
        PledgeAgreement storage pledge = pledgeAgreements[agreementId];
        require(pledge.timestamp != 0, "Pledge not found");
        require(pledge.status == PledgeStatus.ACTIVE, "Pledge not active");

        uint256 paymentAmount = pledge.clientPayment;
        require(usdtToken.balanceOf(address(this)) >= paymentAmount, "Insufficient USDT balance");

        // Transfer USDT to client
        require(usdtToken.transfer(pledge.client, paymentAmount), "USDT transfer failed");

        totalClientPayments += paymentAmount;

        emit ClientPaid(agreementId, pledge.client, paymentAmount);
    }

    /**
     * @dev Allow investors to purchase tokens with USDT
     * @param agreementId The pledge agreement ID
     * @param tokenAmount Amount of tokens to purchase
     * @param purchaseId Unique identifier for this purchase
     */
    function purchaseTokens(
        string memory agreementId,
        uint256 tokenAmount,
        string memory purchaseId
    ) external whenNotPaused nonReentrant {
        PledgeAgreement storage pledge = pledgeAgreements[agreementId];
        require(pledge.timestamp != 0, "Pledge not found");
        require(pledge.status == PledgeStatus.ACTIVE, "Pledge not active");
        require(tokenAmount > 0, "Token amount must be greater than 0");

        // Check if we have enough tokens to sell
        uint256 availableTokens = rwaToken.balanceOf(address(this));
        require(availableTokens >= tokenAmount, "Insufficient tokens available");

        // Calculate USDT required (1 token = 1 USD)
        uint256 usdtRequired = tokenAmount * 1e6; // USDT has 6 decimals

        // Transfer USDT from investor to this contract
        require(usdtToken.transferFrom(msg.sender, address(this), usdtRequired), "USDT transfer failed");

        // Transfer tokens to investor
        require(rwaToken.transfer(msg.sender, tokenAmount), "Token transfer failed");

        // Record the purchase
        InvestorPurchase memory purchase = InvestorPurchase({
            investor: msg.sender,
            tokenAmount: tokenAmount,
            usdtPaid: usdtRequired,
            timestamp: block.timestamp,
            purchaseId: purchaseId
        });

        assetInvestors[agreementId].push(purchase);
        investorPurchases[msg.sender].push(agreementId);
        
        totalInvestorPayments += usdtRequired;
        platformRevenue += (usdtRequired * spreadPercentage) / 100;

        emit TokensPurchased(agreementId, msg.sender, tokenAmount, usdtRequired, purchaseId);
    }

    /**
     * @dev Handle repayment from client (debt structure)
     * @param agreementId The pledge agreement ID
     * @param repaymentAmount Amount being repaid in USDT
     */
    function repayPledge(
        string memory agreementId,
        uint256 repaymentAmount
    ) external onlyRole(FINANCE_ROLE) nonReentrant {
        PledgeAgreement storage pledge = pledgeAgreements[agreementId];
        require(pledge.timestamp != 0, "Pledge not found");
        require(pledge.status == PledgeStatus.ACTIVE, "Pledge not active");

        // Transfer USDT from client for repayment
        require(usdtToken.transferFrom(pledge.client, address(this), repaymentAmount), "USDT transfer failed");

        // Update pledge status
        pledge.status = PledgeStatus.REPAID;

        // Release the asset (burn tokens)
        uint256 tokensToRedeem = pledge.tokensIssued;
        rwaToken.releaseAsset(pledge.assetId, address(this), tokensToRedeem);

        emit PledgeRepaid(agreementId, pledge.client, repaymentAmount);
    }

    /**
     * @dev Get pledge agreement details
     */
    function getPledgeAgreement(string memory agreementId) external view returns (PledgeAgreement memory) {
        return pledgeAgreements[agreementId];
    }

    /**
     * @dev Get investor purchases for an asset
     */
    function getAssetInvestors(string memory agreementId) external view returns (InvestorPurchase[] memory) {
        return assetInvestors[agreementId];
    }

    /**
     * @dev Get client's pledges
     */
    function getClientPledges(address client) external view returns (string[] memory) {
        return clientPledges[client];
    }

    /**
     * @dev Get investor's purchases
     */
    function getInvestorPurchases(address investor) external view returns (string[] memory) {
        return investorPurchases[investor];
    }

    /**
     * @dev Update platform spread percentage
     */
    function setSpreadPercentage(uint256 newSpread) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newSpread <= 50, "Spread cannot exceed 50%");
        uint256 oldSpread = spreadPercentage;
        spreadPercentage = newSpread;
        emit SpreadUpdated(oldSpread, newSpread);
    }

    /**
     * @dev Withdraw platform revenue
     */
    function withdrawRevenue(address to, uint256 amount) external onlyRole(FINANCE_ROLE) {
        require(to != address(0), "Invalid address");
        require(amount <= platformRevenue, "Amount exceeds available revenue");
        require(usdtToken.transfer(to, amount), "USDT transfer failed");
        platformRevenue -= amount;
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get contract financial summary
     */
    function getFinancialSummary() external view returns (
        uint256 _totalClientPayments,
        uint256 _totalInvestorPayments,
        uint256 _platformRevenue,
        uint256 _spreadPercentage
    ) {
        return (totalClientPayments, totalInvestorPayments, platformRevenue, spreadPercentage);
    }

    /**
     * @dev Grant OPERATOR_ROLE to an address (admin only)
     */
    function grantOperatorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(OPERATOR_ROLE, account);
    }

    /**
     * @dev Grant FINANCE_ROLE to an address (admin only)
     */
    function grantFinanceRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(FINANCE_ROLE, account);
    }

    /**
     * @dev Revoke OPERATOR_ROLE from an address (admin only)
     */
    function revokeOperatorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(OPERATOR_ROLE, account);
    }

    /**
     * @dev Revoke FINANCE_ROLE from an address (admin only)
     */
    function revokeFinanceRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(FINANCE_ROLE, account);
    }
}