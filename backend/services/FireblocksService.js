const { FireblocksSDK } = require('fireblocks-sdk');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Fireblocks Service for RWA Tokenization Platform
 * Handles secure transaction signing and wallet management
 */
class FireblocksService {
  constructor() {
    this.fireblocks = null;
    this.provider = null;
    this.vaultAccountId = process.env.FIREBLOCKS_VAULT_ACCOUNT_ID || '0';
    this.assetId = process.env.FIREBLOCKS_ASSET_ID || 'MATIC_POLYGON';
    this.operatorWalletId = process.env.FIREBLOCKS_OPERATOR_WALLET_ID;
    this.financeWalletId = process.env.FIREBLOCKS_FINANCE_WALLET_ID;
    this.initialized = false;
  }

  /**
   * Initialize Fireblocks SDK
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Fireblocks SDK...');

      // Check required environment variables
      if (!process.env.FIREBLOCKS_API_KEY) {
        throw new Error('FIREBLOCKS_API_KEY not found in environment variables');
      }

      if (!process.env.FIREBLOCKS_PRIVATE_KEY_PATH) {
        throw new Error('FIREBLOCKS_PRIVATE_KEY_PATH not found in environment variables');
      }

      // Read Fireblocks private key
      const privateKeyPath = path.resolve(process.env.FIREBLOCKS_PRIVATE_KEY_PATH);
      
      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Fireblocks private key file not found at: ${privateKeyPath}`);
      }

      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

      // Initialize Fireblocks SDK
      this.fireblocks = new FireblocksSDK(
        privateKey,
        process.env.FIREBLOCKS_API_KEY,
        process.env.FIREBLOCKS_BASE_URL || 'https://api.fireblocks.io'
      );

      // Initialize provider
      const rpcUrl = process.env.NODE_ENV === 'production' 
        ? process.env.POLYGON_TESTNET_RPC_URL
        : process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';

      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      // Test connection
      await this.testConnection();

      this.initialized = true;
      console.log('✅ Fireblocks SDK initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Fireblocks SDK:', error.message);
      throw error;
    }
  }

  /**
   * Test Fireblocks connection
   */
  async testConnection() {
    try {
      const vaultAccounts = await this.fireblocks.getVaultAccounts();
      console.log(`✅ Connected to Fireblocks - Found ${vaultAccounts.length} vault accounts`);
      
      // Get the main vault account details
      const mainVault = vaultAccounts.find(vault => vault.id === this.vaultAccountId);
      if (mainVault) {
        console.log(`💰 Main vault account: ${mainVault.name} (ID: ${mainVault.id})`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Fireblocks connection test failed:', error.message);
      throw error;
    }
  }

  /**
   * Get wallet address for a specific vault account
   */
  async getWalletAddress(vaultAccountId = null) {
    try {
      const vaultId = vaultAccountId || this.vaultAccountId;
      const vaultAccount = await this.fireblocks.getVaultAccountById(vaultId);
      
      const asset = vaultAccount.assets.find(asset => asset.id === this.assetId);
      if (!asset || !asset.address) {
        throw new Error(`No ${this.assetId} address found in vault account ${vaultId}`);
      }

      return asset.address;
    } catch (error) {
      console.error('❌ Failed to get wallet address:', error.message);
      throw error;
    }
  }

  /**
   * Get vault account balance
   */
  async getBalance(vaultAccountId = null) {
    try {
      const vaultId = vaultAccountId || this.vaultAccountId;
      const vaultAccount = await this.fireblocks.getVaultAccountById(vaultId);
      
      const asset = vaultAccount.assets.find(asset => asset.id === this.assetId);
      if (!asset) {
        return '0';
      }

      return asset.balance || '0';
    } catch (error) {
      console.error('❌ Failed to get balance:', error.message);
      throw error;
    }
  }

  /**
   * Create and sign a contract transaction
   */
  async executeContractTransaction(contractAddress, contractABI, methodName, params, options = {}) {
    try {
      if (!this.initialized) {
        throw new Error('Fireblocks service not initialized');
      }

      console.log(`🔄 Preparing contract transaction: ${methodName}`);

      // Create contract interface
      const contract = new ethers.Contract(contractAddress, contractABI, this.provider);
      
      // Encode transaction data
      const data = contract.interface.encodeFunctionData(methodName, params);
      
      // Get wallet address
      const fromAddress = await this.getWalletAddress();

      // Estimate gas
      const gasEstimate = await this.provider.estimateGas({
        to: contractAddress,
        from: fromAddress,
        data: data
      });

      // Get current gas price
      const gasPrice = await this.provider.getGasPrice();

      // Create transaction request
      const transactionRequest = {
        vaultAccountId: this.vaultAccountId,
        assetId: this.assetId,
        amount: '0', // Contract calls don't transfer value
        destination: {
          type: 'ONE_TIME_ADDRESS',
          oneTimeAddress: {
            address: contractAddress
          }
        },
        gasPrice: gasPrice.toString(),
        gasLimit: gasEstimate.mul(120).div(100).toString(), // Add 20% buffer
        extraParameters: {
          contractCallData: data
        },
        note: `Contract call: ${methodName}`,
        ...options
      };

      console.log(`🔄 Submitting transaction to Fireblocks...`);

      // Submit transaction
      const result = await this.fireblocks.createTransaction(transactionRequest);
      
      console.log(`✅ Transaction submitted - ID: ${result.id}, Status: ${result.status}`);

      // Wait for transaction to be completed
      const finalResult = await this.waitForTransaction(result.id);
      
      return finalResult;

    } catch (error) {
      console.error('❌ Contract transaction failed:', error.message);
      throw error;
    }
  }

  /**
   * Wait for transaction completion
   */
  async waitForTransaction(transactionId, maxWaitTime = 300000) { // 5 minutes
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    console.log(`🔄 Waiting for transaction ${transactionId} to complete...`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const transaction = await this.fireblocks.getTransactionById(transactionId);
        
        console.log(`Transaction ${transactionId} status: ${transaction.status}`);

        if (transaction.status === 'COMPLETED') {
          console.log(`✅ Transaction ${transactionId} completed successfully`);
          console.log(`🔗 Transaction hash: ${transaction.txHash}`);
          return {
            success: true,
            transactionId: transactionId,
            txHash: transaction.txHash,
            status: transaction.status
          };
        }

        if (transaction.status === 'FAILED' || transaction.status === 'REJECTED' || transaction.status === 'CANCELLED') {
          throw new Error(`Transaction ${transactionId} failed with status: ${transaction.status}`);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        if (error.message.includes('failed with status')) {
          throw error; // Re-throw status errors
        }
        console.log(`Polling error (retrying): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Transaction ${transactionId} timed out after ${maxWaitTime / 1000} seconds`);
  }

  /**
   * Transfer tokens between vault accounts or to external addresses
   */
  async transferTokens(toAddress, amount, assetId = null) {
    try {
      const asset = assetId || this.assetId;
      
      const transferRequest = {
        vaultAccountId: this.vaultAccountId,
        assetId: asset,
        amount: amount.toString(),
        destination: {
          type: 'ONE_TIME_ADDRESS',
          oneTimeAddress: {
            address: toAddress
          }
        },
        note: `RWA Platform transfer: ${amount} ${asset}`
      };

      const result = await this.fireblocks.createTransaction(transferRequest);
      
      return await this.waitForTransaction(result.id);

    } catch (error) {
      console.error('❌ Token transfer failed:', error.message);
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(limit = 50) {
    try {
      const transactions = await this.fireblocks.getTransactions({
        limit: limit,
        orderBy: 'createdAt',
        sort: 'DESC'
      });

      return transactions;
    } catch (error) {
      console.error('❌ Failed to get transaction history:', error.message);
      throw error;
    }
  }

  /**
   * Get supported assets
   */
  async getSupportedAssets() {
    try {
      const assets = await this.fireblocks.getSupportedAssets();
      return assets;
    } catch (error) {
      console.error('❌ Failed to get supported assets:', error.message);
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

module.exports = FireblocksService;