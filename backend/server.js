const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

// Import contract ABIs (we'll create these files next)
const RWATokenABI = require('./contracts/RWAToken.json');
const PledgeManagerABI = require('./contracts/PledgeManager.json');
const MockUSDTABI = require('./contracts/MockUSDT.json');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Blockchain configuration
let provider, signer, rwaToken, pledgeManager, usdtToken;

// Initialize blockchain connection
async function initializeBlockchain() {
  try {
    // Connect to local Hardhat network for development
    const rpcUrl = process.env.NODE_ENV === 'development' 
      ? process.env.LOCAL_RPC_URL 
      : process.env.POLYGON_TESTNET_RPC_URL;
    
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    // Initialize contract instances
    rwaToken = new ethers.Contract(
      process.env.TOKEN_CONTRACT_ADDRESS,
      RWATokenABI.abi,
      signer
    );
    
    pledgeManager = new ethers.Contract(
      process.env.PLEDGE_MANAGER_ADDRESS,
      PledgeManagerABI.abi,
      signer
    );
    
    usdtToken = new ethers.Contract(
      process.env.USDT_CONTRACT_ADDRESS,
      MockUSDTABI.abi,
      signer
    );
    
    console.log('✅ Blockchain connection initialized');
    console.log('📍 Network:', await provider.getNetwork());
    console.log('💰 Signer address:', await signer.getAddress());
    
  } catch (error) {
    console.error('❌ Blockchain initialization failed:', error);
    process.exit(1);
  }
}

// Utility function to generate unique IDs
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const network = await provider.getNetwork();
    const balance = await signer.getBalance();
    
    res.json({
      status: 'healthy',
      network: network.name,
      chainId: network.chainId,
      balance: ethers.utils.formatEther(balance),
      contracts: {
        rwaToken: process.env.TOKEN_CONTRACT_ADDRESS,
        pledgeManager: process.env.PLEDGE_MANAGER_ADDRESS,
        usdt: process.env.USDT_CONTRACT_ADDRESS
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Health check failed', details: error.message });
  }
});

// Get contract information
app.get('/api/contracts/info', async (req, res) => {
  try {
    const rwaTokenName = await rwaToken.name();
    const rwaTokenSymbol = await rwaToken.symbol();
    const totalSupply = await rwaToken.totalSupply();
    const discountRate = await rwaToken.discountRate();
    const totalPledgedValue = await rwaToken.totalPledgedValue();
    
    const financialSummary = await pledgeManager.getFinancialSummary();
    
    res.json({
      rwaToken: {
        name: rwaTokenName,
        symbol: rwaTokenSymbol,
        totalSupply: ethers.utils.formatEther(totalSupply),
        discountRate: discountRate.toString(),
        totalPledgedValue: ethers.utils.formatEther(totalPledgedValue)
      },
      pledgeManager: {
        totalClientPayments: ethers.utils.formatUnits(financialSummary._totalClientPayments, 6),
        totalInvestorPayments: ethers.utils.formatUnits(financialSummary._totalInvestorPayments, 6),
        platformRevenue: ethers.utils.formatUnits(financialSummary._platformRevenue, 6),
        spreadPercentage: financialSummary._spreadPercentage.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contract info', details: error.message });
  }
});

// Create a new pledge agreement
app.post('/api/pledge/create', async (req, res) => {
  try {
    const {
      clientAddress,
      assetType,
      description,
      originalValue,
      documentHash = 'QmHash123...' // IPFS hash placeholder
    } = req.body;
    
    // Validation
    if (!clientAddress || !assetType || !description || !originalValue) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!ethers.utils.isAddress(clientAddress)) {
      return res.status(400).json({ error: 'Invalid client address' });
    }
    
    // Generate unique IDs
    const agreementId = generateId();
    const assetId = `asset_${generateId()}`;
    
    // Convert originalValue to wei (assuming input is in USD)
    const originalValueWei = ethers.utils.parseEther(originalValue.toString());
    
    console.log(`🔄 Creating pledge for ${assetType} worth $${originalValue}...`);
    
    // Create the pledge
    const tx = await pledgeManager.createPledge(
      agreementId,
      clientAddress,
      assetId,
      assetType,
      description,
      originalValueWei,
      documentHash
    );
    
    const receipt = await tx.wait();
    console.log(`✅ Pledge created. Transaction: ${receipt.transactionHash}`);
    
    // Get the created pledge details
    const pledgeDetails = await pledgeManager.getPledgeAgreement(agreementId);
    
    res.json({
      success: true,
      agreementId,
      assetId,
      transactionHash: receipt.transactionHash,
      pledge: {
        agreementId: pledgeDetails.agreementId,
        client: pledgeDetails.client,
        assetType: pledgeDetails.assetType,
        description: pledgeDetails.description,
        originalValue: ethers.utils.formatEther(pledgeDetails.originalValue),
        discountedValue: ethers.utils.formatEther(pledgeDetails.discountedValue),
        tokensIssued: pledgeDetails.tokensIssued.toString(),
        clientPayment: ethers.utils.formatUnits(pledgeDetails.clientPayment, 6),
        status: pledgeDetails.status
      }
    });
    
  } catch (error) {
    console.error('❌ Pledge creation failed:', error);
    res.status(500).json({ error: 'Pledge creation failed', details: error.message });
  }
});

// Pay client after pledge creation
app.post('/api/pledge/pay-client', async (req, res) => {
  try {
    const { agreementId } = req.body;
    
    if (!agreementId) {
      return res.status(400).json({ error: 'Agreement ID is required' });
    }
    
    console.log(`🔄 Processing client payment for agreement ${agreementId}...`);
    
    const tx = await pledgeManager.payClient(agreementId);
    const receipt = await tx.wait();
    
    console.log(`✅ Client paid. Transaction: ${receipt.transactionHash}`);
    
    res.json({
      success: true,
      transactionHash: receipt.transactionHash,
      message: 'Client payment processed successfully'
    });
    
  } catch (error) {
    console.error('❌ Client payment failed:', error);
    res.status(500).json({ error: 'Client payment failed', details: error.message });
  }
});

// Purchase tokens (investor endpoint)
app.post('/api/tokens/purchase', async (req, res) => {
  try {
    const { agreementId, tokenAmount, investorAddress } = req.body;
    
    // Validation
    if (!agreementId || !tokenAmount || !investorAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!ethers.utils.isAddress(investorAddress)) {
      return res.status(400).json({ error: 'Invalid investor address' });
    }
    
    const purchaseId = generateId();
    
    console.log(`🔄 Processing token purchase: ${tokenAmount} tokens for investor ${investorAddress}...`);
    
    // Note: In a real implementation, you'd need to handle the investor's transaction
    // For now, we'll simulate it using the backend signer
    const tx = await pledgeManager.purchaseTokens(agreementId, tokenAmount, purchaseId);
    const receipt = await tx.wait();
    
    console.log(`✅ Tokens purchased. Transaction: ${receipt.transactionHash}`);
    
    res.json({
      success: true,
      purchaseId,
      transactionHash: receipt.transactionHash,
      tokenAmount: tokenAmount.toString(),
      message: 'Token purchase completed successfully'
    });
    
  } catch (error) {
    console.error('❌ Token purchase failed:', error);
    res.status(500).json({ error: 'Token purchase failed', details: error.message });
  }
});

// Get pledge agreement details
app.get('/api/pledge/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;
    
    const pledgeDetails = await pledgeManager.getPledgeAgreement(agreementId);
    
    if (pledgeDetails.timestamp.toString() === '0') {
      return res.status(404).json({ error: 'Pledge agreement not found' });
    }
    
    const investors = await pledgeManager.getAssetInvestors(agreementId);
    
    res.json({
      pledge: {
        agreementId: pledgeDetails.agreementId,
        client: pledgeDetails.client,
        assetId: pledgeDetails.assetId,
        assetType: pledgeDetails.assetType,
        description: pledgeDetails.description,
        originalValue: ethers.utils.formatEther(pledgeDetails.originalValue),
        discountedValue: ethers.utils.formatEther(pledgeDetails.discountedValue),
        tokensIssued: pledgeDetails.tokensIssued.toString(),
        clientPayment: ethers.utils.formatUnits(pledgeDetails.clientPayment, 6),
        timestamp: pledgeDetails.timestamp.toString(),
        status: pledgeDetails.status,
        documentHash: pledgeDetails.documentHash
      },
      investors: investors.map(inv => ({
        investor: inv.investor,
        tokenAmount: inv.tokenAmount.toString(),
        usdtPaid: ethers.utils.formatUnits(inv.usdtPaid, 6),
        timestamp: inv.timestamp.toString(),
        purchaseId: inv.purchaseId
      }))
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pledge details', details: error.message });
  }
});

// Get client's pledges
app.get('/api/client/:address/pledges', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }
    
    const pledgeIds = await pledgeManager.getClientPledges(address);
    
    const pledges = await Promise.all(
      pledgeIds.map(async (id) => {
        const details = await pledgeManager.getPledgeAgreement(id);
        return {
          agreementId: details.agreementId,
          assetType: details.assetType,
          description: details.description,
          originalValue: ethers.utils.formatEther(details.originalValue),
          discountedValue: ethers.utils.formatEther(details.discountedValue),
          clientPayment: ethers.utils.formatUnits(details.clientPayment, 6),
          status: details.status,
          timestamp: details.timestamp.toString()
        };
      })
    );
    
    res.json({ pledges });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client pledges', details: error.message });
  }
});

// USDT faucet for testing
app.post('/api/faucet/usdt', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Valid address is required' });
    }
    
    // Mint test USDT to the address
    const tx = await usdtToken.mint(address, ethers.utils.parseUnits('10000', 6)); // 10,000 USDT
    const receipt = await tx.wait();
    
    res.json({
      success: true,
      transactionHash: receipt.transactionHash,
      amount: '10000',
      message: 'Test USDT sent successfully'
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Faucet failed', details: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    await initializeBlockchain();
    
    app.listen(PORT, () => {
      console.log(`🚀 RWA Backend API running on port ${PORT}`);
      console.log(`📍 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📖 API Documentation: http://localhost:${PORT}/api/contracts/info`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();