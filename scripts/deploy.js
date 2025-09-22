const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting RWA Tokenization Platform Deployment...\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.utils.formatEther(await deployer.getBalance()),
    "MATIC\n"
  );

  // USDT contract address on Polygon mainnet
  const POLYGON_USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // Polygon mainnet
  
  // Determine which USDT to use based on network
  const network = await hre.network.provider.send("eth_chainId");
  let usdtAddress;

  if (network === "0x89") { // Polygon mainnet
    usdtAddress = POLYGON_USDT;
    console.log("📍 Deploying to Polygon Mainnet");
  } else {
    // For testnet and local development, always deploy mock USDT
    console.log("📍 Deploying Mock USDT to testnet/local");
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mockUSDT = await MockUSDT.deploy();
    await mockUSDT.deployed();
    usdtAddress = mockUSDT.address;
    console.log("Mock USDT deployed to:", usdtAddress);

    // Mint some USDT to deployer for testing
    await mockUSDT.mint(deployer.address, ethers.utils.parseUnits("1000000", 6)); // 1M USDT
    console.log("Minted 1,000,000 USDT to deployer for testing");
  }

  console.log("Using USDT at address:", usdtAddress, "\n");

  try {
    // Deploy RWAToken
    console.log("📄 Deploying RWAToken...");
    const RWAToken = await ethers.getContractFactory("RWAToken");
    const rwaToken = await RWAToken.deploy(
      "Real World Asset Token", // name
      "RWAT",                  // symbol
      deployer.address         // admin
    );
    await rwaToken.deployed();
    console.log("✅ RWAToken deployed to:", rwaToken.address);

    // Deploy PledgeManager
    console.log("\n📄 Deploying PledgeManager...");
    const PledgeManager = await ethers.getContractFactory("PledgeManager");
    const pledgeManager = await PledgeManager.deploy(
      rwaToken.address,  // RWA token address
      usdtAddress,       // USDT token address
      deployer.address   // admin (will get all roles)
    );
    await pledgeManager.deployed();
    console.log("✅ PledgeManager deployed to:", pledgeManager.address);

    // Set up cross-contract permissions
    console.log("\n🔐 Setting up cross-contract permissions...");
    
    // Grant PLEDGE_MANAGER_ROLE to PledgeManager contract on RWAToken
    const PLEDGE_MANAGER_ROLE = await rwaToken.PLEDGE_MANAGER_ROLE();
    await rwaToken.grantRole(PLEDGE_MANAGER_ROLE, pledgeManager.address);
    console.log("✅ Granted PLEDGE_MANAGER_ROLE to PledgeManager on RWAToken");

    // Grant MINTER_ROLE to PledgeManager contract on RWAToken
    const MINTER_ROLE = await rwaToken.MINTER_ROLE();
    await rwaToken.grantRole(MINTER_ROLE, pledgeManager.address);
    console.log("✅ Granted MINTER_ROLE to PledgeManager on RWAToken");

    // Fund PledgeManager with USDT for client payments (if using MockUSDT)
    if (network !== "0x89") {
      const mockUSDT = await ethers.getContractAt("MockUSDT", usdtAddress);
      const fundAmount = ethers.utils.parseUnits("500000", 6); // 500K USDT
      await mockUSDT.transfer(pledgeManager.address, fundAmount);
      console.log("💰 Funded PledgeManager with 500,000 USDT for client payments");
    }

    // Verify role assignments
    console.log("\n🔍 Verifying role assignments...");
    
    // Check PledgeManager roles
    const hasOperatorRole = await pledgeManager.hasRole(await pledgeManager.OPERATOR_ROLE(), deployer.address);
    const hasFinanceRole = await pledgeManager.hasRole(await pledgeManager.FINANCE_ROLE(), deployer.address);
    const hasAdminRole = await pledgeManager.hasRole(await pledgeManager.DEFAULT_ADMIN_ROLE(), deployer.address);
    
    console.log(`Deployer has OPERATOR_ROLE: ${hasOperatorRole}`);
    console.log(`Deployer has FINANCE_ROLE: ${hasFinanceRole}`);
    console.log(`Deployer has ADMIN_ROLE: ${hasAdminRole}`);
    
    // Check RWAToken roles
    const hasPledgeManagerRole = await rwaToken.hasRole(PLEDGE_MANAGER_ROLE, pledgeManager.address);
    const hasMinterRole = await rwaToken.hasRole(MINTER_ROLE, pledgeManager.address);
    
    console.log(`PledgeManager has PLEDGE_MANAGER_ROLE: ${hasPledgeManagerRole}`);
    console.log(`PledgeManager has MINTER_ROLE: ${hasMinterRole}`);

    console.log("\n🎉 Deployment completed successfully!");
    console.log("\n📋 Contract Addresses:");
    console.log("=".repeat(50));
    console.log("RWAToken:      ", rwaToken.address);
    console.log("PledgeManager: ", pledgeManager.address);
    console.log("USDT:          ", usdtAddress);
    console.log("Deployer:      ", deployer.address);
    console.log("=".repeat(50));

    // Save addresses to environment file
    console.log("\n💾 Add these addresses to your .env file:");
    console.log(`TOKEN_CONTRACT_ADDRESS=${rwaToken.address}`);
    console.log(`PLEDGE_MANAGER_ADDRESS=${pledgeManager.address}`);
    console.log(`USDT_CONTRACT_ADDRESS=${usdtAddress}`);

    console.log("\n🎯 Testing Information:");
    console.log("- Your address has all required roles for testing");
    console.log("- PledgeManager is funded with USDT for client payments");
    console.log("- You can now call createPledge() without role errors");
    console.log("- All cross-contract permissions are properly set");

    // Verify contracts on Polygonscan (if on mainnet or testnet)
    if (network === "0x89" || network === "0x13882") {
      console.log("\n🔍 Verifying contracts on Polygonscan...");
      
      try {
        await hre.run("verify:verify", {
          address: rwaToken.address,
          constructorArguments: [
            "Real World Asset Token",
            "RWAT",
            deployer.address
          ],
        });
        console.log("✅ RWAToken verified on Polygonscan");
      } catch (error) {
        console.log("❌ RWAToken verification failed:", error.message);
      }

      try {
        await hre.run("verify:verify", {
          address: pledgeManager.address,
          constructorArguments: [
            rwaToken.address,
            usdtAddress,
            deployer.address
          ],
        });
        console.log("✅ PledgeManager verified on Polygonscan");
      } catch (error) {
        console.log("❌ PledgeManager verification failed:", error.message);
      }
    }

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.log("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
