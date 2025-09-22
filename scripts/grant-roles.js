const { ethers } = require("hardhat");

async function main() {
  console.log("🔐 Granting roles to backend signer...\n");

  // Contract addresses from your deployment
  const PLEDGE_MANAGER_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";
  const RWA_TOKEN_ADDRESS = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
  
  // Backend signer address that needs roles
  const BACKEND_SIGNER = "0x7931edfa6255d59aee5a65d26e6a7e3cf30e8339";

  // Get deployer (has admin rights)
  const [deployer] = await ethers.getSigners();
  console.log("Admin address:", deployer.address);
  console.log("Backend signer:", BACKEND_SIGNER);

  // Get contract instances
  const pledgeManager = await ethers.getContractAt("PledgeManager", PLEDGE_MANAGER_ADDRESS);
  const rwaToken = await ethers.getContractAt("RWAToken", RWA_TOKEN_ADDRESS);

  try {
    console.log("\n🔄 Granting PledgeManager roles...");
    
    // Grant OPERATOR_ROLE to backend signer
    const operatorRole = await pledgeManager.OPERATOR_ROLE();
    await pledgeManager.grantRole(operatorRole, BACKEND_SIGNER);
    console.log("✅ Granted OPERATOR_ROLE to backend signer");

    // Grant FINANCE_ROLE to backend signer  
    const financeRole = await pledgeManager.FINANCE_ROLE();
    await pledgeManager.grantRole(financeRole, BACKEND_SIGNER);
    console.log("✅ Granted FINANCE_ROLE to backend signer");

    // Grant DEFAULT_ADMIN_ROLE to backend signer
    const adminRole = await pledgeManager.DEFAULT_ADMIN_ROLE();
    await pledgeManager.grantRole(adminRole, BACKEND_SIGNER);
    console.log("✅ Granted DEFAULT_ADMIN_ROLE to backend signer");

    console.log("\n🔄 Granting RWAToken roles...");

    // Grant MINTER_ROLE to backend signer on RWAToken
    const minterRole = await rwaToken.MINTER_ROLE();
    await rwaToken.grantRole(minterRole, BACKEND_SIGNER);
    console.log("✅ Granted MINTER_ROLE to backend signer");

    // Grant PAUSER_ROLE to backend signer on RWAToken
    const pauserRole = await rwaToken.PAUSER_ROLE();
    await rwaToken.grantRole(pauserRole, BACKEND_SIGNER);
    console.log("✅ Granted PAUSER_ROLE to backend signer");

    // Grant DEFAULT_ADMIN_ROLE to backend signer on RWAToken
    const rwaAdminRole = await rwaToken.DEFAULT_ADMIN_ROLE();
    await rwaToken.grantRole(rwaAdminRole, BACKEND_SIGNER);
    console.log("✅ Granted DEFAULT_ADMIN_ROLE to backend signer on RWAToken");

    console.log("\n🔍 Verifying role assignments...");

    // Verify PledgeManager roles
    const hasOperator = await pledgeManager.hasRole(operatorRole, BACKEND_SIGNER);
    const hasFinance = await pledgeManager.hasRole(financeRole, BACKEND_SIGNER);
    const hasAdmin = await pledgeManager.hasRole(adminRole, BACKEND_SIGNER);

    console.log(`Backend has OPERATOR_ROLE: ${hasOperator}`);
    console.log(`Backend has FINANCE_ROLE: ${hasFinance}`);
    console.log(`Backend has ADMIN_ROLE: ${hasAdmin}`);

    // Verify RWAToken roles
    const hasMinter = await rwaToken.hasRole(minterRole, BACKEND_SIGNER);
    const hasPauser = await rwaToken.hasRole(pauserRole, BACKEND_SIGNER);
    const hasRwaAdmin = await rwaToken.hasRole(rwaAdminRole, BACKEND_SIGNER);

    console.log(`Backend has MINTER_ROLE on RWAToken: ${hasMinter}`);
    console.log(`Backend has PAUSER_ROLE on RWAToken: ${hasPauser}`);
    console.log(`Backend has ADMIN_ROLE on RWAToken: ${hasRwaAdmin}`);

    if (hasOperator && hasFinance && hasAdmin && hasMinter) {
      console.log("\n🎉 All roles granted successfully!");
      console.log("🚀 Your backend can now call createPledge() without errors!");
    } else {
      console.log("\n❌ Some role assignments failed. Check the logs above.");
    }

  } catch (error) {
    console.error("❌ Failed to grant roles:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });