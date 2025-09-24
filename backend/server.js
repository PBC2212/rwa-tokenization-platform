const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const path = require('path');
const FireblocksService = require('./services/FireblocksService');
const SupabaseService = require('./services/SupabaseService');
const DatabaseSyncService = require('./services/DatabaseSyncService');
const DatabaseQueryService = require('./services/DatabaseQueryService');
require('dotenv').config();

// Import contract ABIs with error handling
let RWATokenABI, PledgeManagerABI, MockUSDTABI;
try {
  RWATokenABI = require('./contracts/RWAToken.json');
  PledgeManagerABI = require('./contracts/PledgeManager.json');
  MockUSDTABI = require('./contracts/MockUSDT.json');
} catch (error) {
  console.log('⚠️ Contract ABIs not found, they will be loaded after compilation');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const fireblocksService = new FireblocksService();
const supabaseService = new SupabaseService();
let dbSyncService;
let dbQueryService;

// Middleware
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (before blockchain initialization)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    fireblocks: fireblocksService.isInitialized(),
    supabase: supabaseService.isInitialized()
  });
});

// Blockchain configuration
let provider, operatorAddress, financeAddress;

// Initialize blockchain and all services
async function initializeServices() {
  try {
    console.log('🔄 Initializing services...');
    
    // Initialize provider
    let rpcUrl;
    if (process.env.NODE_ENV === 'production') {
      rpcUrl = process.env.POLYGON_TESTNET_RPC_URL;
      console.log('📍 Production mode: Using Amoy testnet');
    } else {
      rpcUrl = process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
      console.log('📍 Development mode: Using local network');
    }
    
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    console.log('✅ Provider connected to network:', network.name, '(ChainId:', network.chainId + ')');

    // Initialize Fireblocks in production
    if (process.env.NODE_ENV === 'production') {
      try {
        await fireblocksService.initialize();
        
        // Get wallet addresses from Fireblocks
        operatorAddress = await fireblocksService.getWalletAddress();
        financeAddress = operatorAddress; // Using same wallet for both roles in demo
        
        console.log('💰 Operator address (Fireblocks):', operatorAddress);
        console.log('💰 Finance address (Fireblocks):', financeAddress);
        
        // Get balance
        const balance = await fireblocksService.getBalance();
        console.log('💰 Wallet balance:', balance, 'MATIC');
        
      } catch (fireblocksError) {
        console.log('⚠️ Fireblocks initialization failed, falling back to direct wallet');
        console.log('Fireblocks error:', fireblocksError.message);
        
        // Fall back to direct wallet
        if (!process.env.PRIVATE_KEY) {
          throw new Error('PRIVATE_KEY not found for fallback wallet');
        }
        
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        operatorAddress = wallet.address;
        financeAddress = wallet.address;
        
        const balance = await wallet.getBalance();
        console.log('💰 Fallback wallet:', operatorAddress);
        console.log('💰 Balance:', ethers.utils.formatEther(balance), 'MATIC');
      }
    } else {
      // Development mode - use direct wallet
      if (!process.env.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY not found for development mode');
      }
      
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      operatorAddress = wallet.address;
      financeAddress = wallet.address;
      
      const balance = await wallet.getBalance();
      console.log('💰 Development wallet:', operatorAddress);
      console.log('💰 Balance:', ethers.utils.formatEther(balance), 'MATIC');
    }

    // Initialize Supabase and database services
    try {
      await supabaseService.initialize();
      console.log('✅ Supabase service initialized');
      
      // Initialize Database Sync Service
      dbSyncService = new DatabaseSyncService(supabaseService);
      console.log('✅ Database sync service initialized');
      
      // Initialize Database Query Service
      dbQueryService = new DatabaseQueryService(supabaseService);
      console.log('✅ Database query service initialized');
    } catch (error) {
      console.log('⚠️ Supabase initialization failed:', error.message);
      // Continue without Supabase for now
    }
    
    // Verify contract addresses
    if (!process.env.TOKEN_CONTRACT_ADDRESS || !process.env.PLEDGE_MANAGER_ADDRESS || !process.env.USDT_CONTRACT_ADDRESS) {
      throw new Error('Contract addresses not found in environment variables');
    }
    
    console.log('📄 Contract addresses verified');
    console.log('📄 RWAToken:', process.env.TOKEN_CONTRACT_ADDRESS);
    console.log('📄 PledgeManager:', process.env.PLEDGE_MANAGER_ADDRESS);
    console.log('📄 USDT:', process.env.USDT_CONTRACT_ADDRESS);
    
    // Set up USDT for demo purposes
    await ensureUSDTForDemo();
    
  } catch (error) {
    console.error('❌ Service initialization failed:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
}

// Utility function to generate unique IDs
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Utility function to ensure backend has USDT and approvals for demo
async function ensureUSDTForDemo() {
  try {
    if (!MockUSDTABI) {
      console.log('⚠️ MockUSDT ABI not available, skipping USDT setup');
      return;
    }
    
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const usdtContract = new ethers.Contract(process.env.USDT_CONTRACT_ADDRESS, MockUSDTABI.abi, wallet);
    
    // Check USDT balance
    const balance = await usdtContract.balanceOf(wallet.address);
    const balanceFormatted = ethers.utils.formatUnits(balance, 6);
    
    console.log(`💰 Backend USDT balance: ${balanceFormatted} USDT`);
    
    // If balance is low, mint more USDT (this only works with MockUSDT)
    if (balance.lt(ethers.utils.parseUnits('10000', 6))) {
      console.log('🔄 Minting USDT for backend wallet...');
      
      // Use gas settings for Amoy if needed
      const network = await provider.getNetwork();
      let gasSettings = {};
      
      if (network.chainId === 80002) {
        gasSettings = {
          maxFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
          maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
          gasLimit: 200000
        };
      }
      
      const mintTx = await usdtContract.mint(
        wallet.address, 
        ethers.utils.parseUnits('50000', 6),
        gasSettings
      );
      await mintTx.wait();
      console.log('✅ Minted 50,000 USDT for backend wallet');
    }
    
    // Check and approve USDT spending for PledgeManager
    const allowance = await usdtContract.allowance(wallet.address, process.env.PLEDGE_MANAGER_ADDRESS);
    const allowanceFormatted = ethers.utils.formatUnits(allowance, 6);
    
    console.log(`🔐 USDT allowance for PledgeManager: ${allowanceFormatted} USDT`);
    
    if (allowance.lt(ethers.utils.parseUnits('100000', 6))) {
      console.log('🔄 Approving USDT spending for PledgeManager...');
      
      // Use gas settings for Amoy if needed
      const network = await provider.getNetwork();
      let gasSettings = {};
      
      if (network.chainId === 80002) {
        gasSettings = {
          maxFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
          maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
          gasLimit: 100000
        };
      }
      
      const approveTx = await usdtContract.approve(
        process.env.PLEDGE_MANAGER_ADDRESS, 
        ethers.utils.parseUnits('1000000', 6), // Approve 1M USDT
        gasSettings
      );
      await approveTx.wait();
      console.log('✅ Approved USDT spending for PledgeManager');
    }
    
  } catch (error) {
    console.log('⚠️ USDT setup failed:', error.message);
  }
}

// Utility function to execute contract transaction
async function executeContractTransaction(contractAddress, abi, methodName, params, options = {}) {
  if (process.env.NODE_ENV === 'production' && fireblocksService.isInitialized()) {
    // Use Fireblocks in production
    return await fireblocksService.executeContractTransaction(
      contractAddress,
      abi,
      methodName,
      params,
      options
    );
  } else {
    // Use direct wallet in development/fallback
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    // Get current network to determine gas settings
    const network = await provider.getNetwork();
    const isAmoyTestnet = network.chainId === 80002;
    
    let gasSettings = {};
    
    if (isAmoyTestnet) {
      // Amoy testnet requires higher gas prices
      gasSettings = {
        maxFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
        gasLimit: 2000000
      };
      
      console.log('🔥 Using Amoy testnet gas settings:', {
        maxFeePerGas: '50 gwei',
        maxPriorityFeePerGas: '30 gwei',
        gasLimit: '2,000,000'
      });
    } else {
      // Local network or other networks - use default gas settings
      const gasPrice = await provider.getGasPrice();
      gasSettings = {
        gasPrice: gasPrice.mul(110).div(100), // Add 10% buffer
        gasLimit: 2000000
      };
      
      console.log('🔥 Using default gas settings:', {
        gasPrice: ethers.utils.formatUnits(gasSettings.gasPrice, 'gwei') + ' gwei',
        gasLimit: '2,000,000'
      });
    }
    
    // Execute transaction with proper gas settings
    const tx = await contract[methodName](...params, gasSettings);
    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed: ${receipt.transactionHash}`);
    
    return {
      success: true,
      transactionId: receipt.transactionHash,
      txHash: receipt.transactionHash,
      status: 'COMPLETED'
    };
  }
}

// ==================== API ROUTES ====================

// Health check with service status
app.get('/api/health', async (req, res) => {
  try {
    const status = {
      status: 'healthy',
      environment: process.env.NODE_ENV || 'development',
      services: {
        provider: !!provider,
        fireblocks: fireblocksService.isInitialized(),
        supabase: supabaseService.isInitialized(),
        dbSync: !!dbSyncService,
        dbQuery: !!dbQueryService
      }
    };
    
    if (provider) {
      const network = await provider.getNetwork();
      status.network = network.name;
      status.chainId = network.chainId;
    }
    
    if (fireblocksService.isInitialized()) {
      const balance = await fireblocksService.getBalance();
      status.balance = balance;
      status.walletAddress = operatorAddress;
    } else if (operatorAddress) {
      status.walletAddress = operatorAddress;
      
      // Get balance for direct wallet
      if (process.env.PRIVATE_KEY) {
        try {
          const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
          const balance = await wallet.getBalance();
          status.balance = ethers.utils.formatEther(balance);
        } catch (error) {
          status.balance = 'Error getting balance';
        }
      }
    }
    
    status.contracts = {
      rwaToken: process.env.TOKEN_CONTRACT_ADDRESS,
      pledgeManager: process.env.PLEDGE_MANAGER_ADDRESS,
      usdt: process.env.USDT_CONTRACT_ADDRESS
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: 'Health check failed', 
      details: error.message,
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// Get contract information
app.get('/api/contracts/info', async (req, res) => {
  try {
    if (!RWATokenABI || !PledgeManagerABI) {
      return res.status(503).json({ 
        error: 'Contract ABIs not loaded',
        message: 'Please ensure contracts are compiled and ABIs are available'
      });
    }
    
    // Create contract instances for reading (no signing required)
    const rwaToken = new ethers.Contract(process.env.TOKEN_CONTRACT_ADDRESS, RWATokenABI.abi, provider);
    const pledgeManager = new ethers.Contract(process.env.PLEDGE_MANAGER_ADDRESS, PledgeManagerABI.abi, provider);
    
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
    if (!PledgeManagerABI) {
      return res.status(503).json({ 
        error: 'PledgeManager ABI not loaded',
        message: 'Please ensure contracts are compiled'
      });
    }
    
    const {
      clientAddress,
      assetType,
      description,
      originalValue,
      documentHash = 'QmHash123...'
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
    
    // Convert originalValue to wei
    const originalValueWei = ethers.utils.parseEther(originalValue.toString());
    
    console.log(`🔄 Creating pledge for ${assetType} worth $${originalValue}...`);
    console.log(`🔄 Agreement ID: ${agreementId}`);
    console.log(`🔄 Asset ID: ${assetId}`);
    
    // Execute transaction via Fireblocks or direct wallet
    const result = await executeContractTransaction(
      process.env.PLEDGE_MANAGER_ADDRESS,
      PledgeManagerABI.abi,
      'createPledge',
      [
        agreementId,
        clientAddress,
        assetId,
        assetType,
        description,
        originalValueWei,
        documentHash
      ]
    );
    
    if (!result.success) {
      throw new Error('Transaction failed');
    }
    
    console.log(`✅ Pledge created successfully`);
    console.log(`🔗 Transaction hash: ${result.txHash}`);
    
    // Get the created pledge details
    const pledgeManager = new ethers.Contract(process.env.PLEDGE_MANAGER_ADDRESS, PledgeManagerABI.abi, provider);
    const pledgeDetails = await pledgeManager.getPledgeAgreement(agreementId);
    
    // Sync to database
    try {
      if (dbSyncService) {
        await dbSyncService.syncPledgeCreation({
          agreementId: pledgeDetails.agreementId,
          client: pledgeDetails.client,
          assetId: pledgeDetails.assetId,
          assetType: pledgeDetails.assetType,
          description: pledgeDetails.description,
          originalValue: pledgeDetails.originalValue.toString(),
          discountedValue: pledgeDetails.discountedValue.toString(),
          tokensIssued: pledgeDetails.tokensIssued.toString(),
          clientPayment: pledgeDetails.clientPayment.toString(),
          status: pledgeDetails.status,
          documentHash: pledgeDetails.documentHash
        }, {
          txHash: result.txHash,
          contractAddress: process.env.PLEDGE_MANAGER_ADDRESS,
          from: operatorAddress,
          to: process.env.PLEDGE_MANAGER_ADDRESS
        });
      }
    } catch (syncError) {
      console.log('⚠️ Database sync failed:', syncError.message);
      // Continue anyway - transaction succeeded
    }
    
    res.json({
      success: true,
      agreementId,
      assetId,
      transactionHash: result.txHash,
      transactionId: result.transactionId,
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
    if (!PledgeManagerABI) {
      return res.status(503).json({ 
        error: 'PledgeManager ABI not loaded'
      });
    }
    
    const { agreementId } = req.body;
    
    if (!agreementId) {
      return res.status(400).json({ error: 'Agreement ID is required' });
    }
    
    console.log(`🔄 Processing client payment for agreement ${agreementId}...`);
    
    // Execute transaction via Fireblocks or direct wallet
    const result = await executeContractTransaction(
      process.env.PLEDGE_MANAGER_ADDRESS,
      PledgeManagerABI.abi,
      'payClient',
      [agreementId]
    );
    
    if (!result.success) {
      throw new Error('Transaction failed');
    }
    
    console.log(`✅ Client payment processed successfully`);
    console.log(`🔗 Transaction hash: ${result.txHash}`);
    
    // Sync to database
    try {
      if (dbSyncService) {
        const pledgeManager = new ethers.Contract(process.env.PLEDGE_MANAGER_ADDRESS, PledgeManagerABI.abi, provider);
        const pledgeDetails = await pledgeManager.getPledgeAgreement(agreementId);
        
        await dbSyncService.syncClientPayment(
          agreementId,
          pledgeDetails.client,
          pledgeDetails.clientPayment.toString(),
          {
            txHash: result.txHash,
            contractAddress: process.env.PLEDGE_MANAGER_ADDRESS,
            from: operatorAddress,
            to: pledgeDetails.client
          }
        );
      }
    } catch (syncError) {
      console.log('⚠️ Database sync failed:', syncError.message);
    }
    
    res.json({
      success: true,
      transactionHash: result.txHash,
      transactionId: result.transactionId,
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
    
    // For demo purposes, backend wallet purchases tokens then transfers to investor
    // In production, the investor would call this themselves with their own USDT
    const result = await executeContractTransaction(
      process.env.PLEDGE_MANAGER_ADDRESS,
      PledgeManagerABI.abi,
      'purchaseTokens',
      [agreementId, tokenAmount, purchaseId]
    );
    
    if (!result.success) {
      throw new Error('Token purchase transaction failed');
    }
    
    // After purchase, transfer tokens from backend to investor
    if (investorAddress !== operatorAddress) {
      try {
        console.log(`🔄 Transferring ${tokenAmount} tokens to investor...`);
        const transferResult = await executeContractTransaction(
          process.env.TOKEN_CONTRACT_ADDRESS,
          RWATokenABI.abi,
          'transfer',
          [investorAddress, tokenAmount]
        );
        console.log(`✅ Tokens transferred to investor: ${transferResult.txHash}`);
      } catch (transferError) {
        console.log('⚠️ Token transfer to investor failed:', transferError.message);
        // Continue anyway - tokens are still purchased, just in backend wallet
      }
    }
    
    // Sync to database
    try {
      if (dbSyncService) {
        const usdtRequired = tokenAmount * 1000000; // Convert to USDT (6 decimals)
        await dbSyncService.syncTokenPurchase({
          purchaseId,
          agreementId,
          investorAddress: investorAddress,
          tokenAmount: tokenAmount.toString(),
          usdtPaid: usdtRequired.toString()
        }, {
          txHash: result.txHash,
          contractAddress: process.env.PLEDGE_MANAGER_ADDRESS,
          from: operatorAddress,
          to: investorAddress
        });
      }
    } catch (syncError) {
      console.log('⚠️ Database sync failed:', syncError.message);
    }
    
    console.log(`✅ Token purchase completed. Transaction: ${result.txHash}`);
    
    res.json({
      success: true,
      purchaseId,
      transactionHash: result.txHash,
      transactionId: result.transactionId,
      tokenAmount: tokenAmount.toString(),
      investorAddress: investorAddress,
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
    if (!PledgeManagerABI) {
      return res.status(503).json({ error: 'PledgeManager ABI not loaded' });
    }
    
    const { agreementId } = req.params;
    
    const pledgeManager = new ethers.Contract(process.env.PLEDGE_MANAGER_ADDRESS, PledgeManagerABI.abi, provider);
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
    
    const pledgeManager = new ethers.Contract(process.env.PLEDGE_MANAGER_ADDRESS, PledgeManagerABI.abi, provider);
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

// ==================== DATABASE API ROUTES ====================

// Basic database queries (from previous step)
app.get('/api/database/pledges', async (req, res) => {
  try {
    if (!dbSyncService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database service not available' });
    }

    const { clientAddress, status, limit } = req.query;
    const filters = {};
    
    if (clientAddress) filters.clientAddress = clientAddress;
    if (status !== undefined) filters.status = parseInt(status);
    if (limit) filters.limit = parseInt(limit);

    const pledges = await dbSyncService.getPledgeAgreements(filters);
    
    res.json({
      success: true,
      pledges: pledges
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pledges from database', details: error.message });
  }
});

app.get('/api/database/purchases', async (req, res) => {
  try {
    if (!dbSyncService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database service not available' });
    }

    const { investorAddress, agreementId, limit } = req.query;
    const filters = {};
    
    if (investorAddress) filters.investorAddress = investorAddress;
    if (agreementId) filters.agreementId = agreementId;
    if (limit) filters.limit = parseInt(limit);

    const purchases = await dbSyncService.getInvestorPurchases(filters);
    
    res.json({
      success: true,
      purchases: purchases
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch purchases from database', details: error.message });
  }
});

app.get('/api/database/analytics', async (req, res) => {
  try {
    if (!dbSyncService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database service not available' });
    }

    const days = parseInt(req.query.days) || 30;
    const analytics = await dbSyncService.getPlatformAnalytics(days);
    
    res.json({
      success: true,
      analytics: analytics
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics from database', details: error.message });
  }
});

// ==================== ADVANCED ANALYTICS API ROUTES ====================

// Advanced Analytics Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const dashboardData = await dbQueryService.getDashboardData();
    
    res.json({
      success: true,
      dashboard: dashboardData
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: error.message });
  }
});

// Pledge Performance Analytics
app.get('/api/analytics/pledge-performance', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const performance = await dbQueryService.getPledgePerformance();
    
    res.json({
      success: true,
      performance: performance
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pledge performance', details: error.message });
  }
});

// Investor Activity Analytics
app.get('/api/analytics/investor-activity', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const { address } = req.query;
    const activity = await dbQueryService.getInvestorActivity(address);
    
    res.json({
      success: true,
      activity: activity
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch investor activity', details: error.message });
  }
});

// Time Series Data for Charts
app.get('/api/analytics/time-series', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const days = parseInt(req.query.days) || 30;
    const timeSeriesData = await dbQueryService.getTimeSeriesData(days);
    
    res.json({
      success: true,
      timeSeries: timeSeriesData
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch time series data', details: error.message });
  }
});

// Search Transactions
app.get('/api/search', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const { q: searchQuery, type = 'all' } = req.query;
    
    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await dbQueryService.searchTransactions(searchQuery, type);
    
    res.json({
      success: true,
      query: searchQuery,
      type: type,
      results: results
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Transaction Logs with Advanced Filtering
app.get('/api/logs/transactions', async (req, res) => {
  try {
    if (!dbQueryService || !supabaseService.isInitialized()) {
      return res.status(503).json({ error: 'Database query service not available' });
    }

    const filters = {
      transactionType: req.query.type,
      status: req.query.status,
      fromAddress: req.query.from,
      toAddress: req.query.to,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const logs = await dbQueryService.getTransactionLogs(filters);
    
    res.json({
      success: true,
      filters: filters,
      logs: logs
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction logs', details: error.message });
  }
});

// ==================== FIREBLOCKS API ROUTES ====================

// Get Fireblocks transaction history
app.get('/api/fireblocks/transactions', async (req, res) => {
  try {
    if (!fireblocksService.isInitialized()) {
      return res.status(503).json({ error: 'Fireblocks service not initialized' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const transactions = await fireblocksService.getTransactionHistory(limit);
    
    res.json({
      success: true,
      transactions: transactions
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction history', details: error.message });
  }
});

// Get Fireblocks wallet info
app.get('/api/fireblocks/wallet', async (req, res) => {
  try {
    if (!fireblocksService.isInitialized()) {
      return res.status(503).json({ error: 'Fireblocks service not initialized' });
    }
    
    const address = await fireblocksService.getWalletAddress();
    const balance = await fireblocksService.getBalance();
    
    res.json({
      success: true,
      wallet: {
        address: address,
        balance: balance,
        assetId: fireblocksService.assetId,
        vaultAccountId: fireblocksService.vaultAccountId
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wallet info', details: error.message });
  }
});

// ==================== TESTING/DEVELOPMENT ROUTES ====================

// USDT faucet for testing (only in development)
app.post('/api/faucet/usdt', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Faucet not available in production' });
    }
    
    if (!MockUSDTABI) {
      return res.status(503).json({ error: 'USDT contract ABI not loaded' });
    }
    
    const { address } = req.body;
    
    if (!address || !ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Valid address is required' });
    }
    
    // Execute mint transaction
    const result = await executeContractTransaction(
      process.env.USDT_CONTRACT_ADDRESS,
      MockUSDTABI.abi,
      'mint',
      [address, ethers.utils.parseUnits('10000', 6)]
    );
    
    res.json({
      success: true,
      transactionHash: result.txHash,
      transactionId: result.transactionId,
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
  res.status(500).json({ 
    error: 'Internal server error', 
    details: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    // Initialize services
    await initializeServices();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 RWA Backend API with Fireblocks & Supabase running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📍 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔥 Fireblocks integration: ${fireblocksService.isInitialized() ? 'Active' : 'Disabled'}`);
      console.log(`🗃️ Supabase integration: ${supabaseService.isInitialized() ? 'Active' : 'Disabled'}`);
      console.log(`📊 Advanced analytics: ${dbQueryService ? 'Available' : 'Disabled'}`);
      
      if (RWATokenABI && PledgeManagerABI) {
        console.log(`📖 Contract info: http://localhost:${PORT}/api/contracts/info`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

startServer();