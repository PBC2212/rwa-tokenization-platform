const fs = require('fs');
const path = require('path');

// Paths
const artifactsDir = path.join(__dirname, 'artifacts', 'contracts');
const backendContractsDir = path.join(__dirname, 'backend', 'contracts');

// Create backend/contracts directory if it doesn't exist
if (!fs.existsSync(backendContractsDir)) {
  fs.mkdirSync(backendContractsDir, { recursive: true });
}

// Contract files to copy
const contracts = [
  'RWAToken.sol/RWAToken.json',
  'PledgeManager.sol/PledgeManager.json',
  'MockUSDT.sol/MockUSDT.json'
];

console.log('📄 Copying contract ABIs...');

contracts.forEach(contractPath => {
  const sourcePath = path.join(artifactsDir, contractPath);
  const fileName = path.basename(contractPath);
  const destPath = path.join(backendContractsDir, fileName);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`✅ Copied ${fileName}`);
    } else {
      console.log(`❌ Source file not found: ${sourcePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to copy ${fileName}:`, error.message);
  }
});

console.log('🎉 ABI copying completed!');
console.log(`📁 ABIs copied to: ${backendContractsDir}`);