const { ethers } = require('ethers');

/**
 * Database Synchronization Service
 * Syncs blockchain events and transactions with Supabase database
 */
class DatabaseSyncService {
  constructor(supabaseService) {
    this.supabase = supabaseService;
  }

  /**
   * Sync pledge creation to database
   */
  async syncPledgeCreation(pledgeData, transactionData) {
    try {
      if (!this.supabase.isInitialized()) {
        console.log('⚠️ Supabase not initialized, skipping database sync');
        return null;
      }

      console.log('🔄 Syncing pledge creation to database...');

      const client = this.supabase.getClient();

      // Insert pledge agreement
      const pledgeRecord = {
        agreement_id: pledgeData.agreementId,
        client_address: pledgeData.client.toLowerCase(),
        asset_id: pledgeData.assetId,
        asset_type: pledgeData.assetType,
        description: pledgeData.description,
        original_value: pledgeData.originalValue, // Store as string to avoid precision loss
        discounted_value: pledgeData.discountedValue,
        tokens_issued: pledgeData.tokensIssued,
        client_payment: pledgeData.clientPayment,
        status: pledgeData.status || 1, // 1 = ACTIVE
        document_hash: pledgeData.documentHash,
        transaction_hash: transactionData.txHash,
        block_number: transactionData.blockNumber || null
      };

      const { data: pledge, error: pledgeError } = await client
        .from('pledge_agreements')
        .insert(pledgeRecord)
        .select()
        .single();

      if (pledgeError) {
        console.error('❌ Failed to insert pledge agreement:', pledgeError);
        throw pledgeError;
      }

      // Log transaction
      await this.logTransaction({
        transaction_hash: transactionData.txHash,
        transaction_type: 'CREATE_PLEDGE',
        from_address: transactionData.from,
        to_address: transactionData.to,
        contract_address: transactionData.contractAddress,
        method_name: 'createPledge',
        parameters: {
          agreementId: pledgeData.agreementId,
          clientAddress: pledgeData.client,
          assetType: pledgeData.assetType,
          originalValue: pledgeData.originalValue
        },
        block_number: transactionData.blockNumber,
        status: 'COMPLETED'
      });

      // Update daily analytics
      await this.updateDailyAnalytics('pledge_created', pledgeData.originalValue);

      console.log('✅ Pledge creation synced to database');
      return pledge;

    } catch (error) {
      console.error('❌ Database sync error:', error);
      throw error;
    }
  }

  /**
   * Sync client payment to database
   */
  async syncClientPayment(agreementId, clientAddress, amount, transactionData) {
    try {
      if (!this.supabase.isInitialized()) {
        console.log('⚠️ Supabase not initialized, skipping database sync');
        return null;
      }

      console.log('🔄 Syncing client payment to database...');

      const client = this.supabase.getClient();

      // Insert client payment record
      const paymentRecord = {
        agreement_id: agreementId,
        client_address: clientAddress.toLowerCase(),
        amount: amount,
        transaction_hash: transactionData.txHash,
        block_number: transactionData.blockNumber || null
      };

      const { data: payment, error: paymentError } = await client
        .from('client_payments')
        .insert(paymentRecord)
        .select()
        .single();

      if (paymentError) {
        console.error('❌ Failed to insert client payment:', paymentError);
        throw paymentError;
      }

      // Log transaction
      await this.logTransaction({
        transaction_hash: transactionData.txHash,
        transaction_type: 'PAY_CLIENT',
        from_address: transactionData.from,
        to_address: clientAddress,
        contract_address: transactionData.contractAddress,
        method_name: 'payClient',
        parameters: {
          agreementId: agreementId,
          amount: amount
        },
        block_number: transactionData.blockNumber,
        status: 'COMPLETED'
      });

      // Update daily analytics
      await this.updateDailyAnalytics('client_paid', amount);

      console.log('✅ Client payment synced to database');
      return payment;

    } catch (error) {
      console.error('❌ Database sync error:', error);
      throw error;
    }
  }

  /**
   * Sync investor token purchase to database
   */
  async syncTokenPurchase(purchaseData, transactionData) {
    try {
      if (!this.supabase.isInitialized()) {
        console.log('⚠️ Supabase not initialized, skipping database sync');
        return null;
      }

      console.log('🔄 Syncing token purchase to database...');

      const client = this.supabase.getClient();

      // Insert investor purchase record
      const purchaseRecord = {
        purchase_id: purchaseData.purchaseId,
        agreement_id: purchaseData.agreementId,
        investor_address: purchaseData.investorAddress.toLowerCase(),
        token_amount: purchaseData.tokenAmount,
        usdt_paid: purchaseData.usdtPaid,
        transaction_hash: transactionData.txHash,
        block_number: transactionData.blockNumber || null
      };

      const { data: purchase, error: purchaseError } = await client
        .from('investor_purchases')
        .insert(purchaseRecord)
        .select()
        .single();

      if (purchaseError) {
        console.error('❌ Failed to insert investor purchase:', purchaseError);
        throw purchaseError;
      }

      // Log transaction
      await this.logTransaction({
        transaction_hash: transactionData.txHash,
        transaction_type: 'PURCHASE_TOKENS',
        from_address: purchaseData.investorAddress,
        to_address: transactionData.contractAddress,
        contract_address: transactionData.contractAddress,
        method_name: 'purchaseTokens',
        parameters: {
          agreementId: purchaseData.agreementId,
          tokenAmount: purchaseData.tokenAmount,
          purchaseId: purchaseData.purchaseId
        },
        block_number: transactionData.blockNumber,
        status: 'COMPLETED'
      });

      // Update daily analytics
      await this.updateDailyAnalytics('tokens_purchased', purchaseData.usdtPaid);

      console.log('✅ Token purchase synced to database');
      return purchase;

    } catch (error) {
      console.error('❌ Database sync error:', error);
      throw error;
    }
  }

  /**
   * Log transaction to database
   */
  async logTransaction(transactionData) {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();

      const { data, error } = await client
        .from('transaction_log')
        .insert({
          transaction_hash: transactionData.transaction_hash,
          transaction_type: transactionData.transaction_type,
          from_address: transactionData.from_address?.toLowerCase(),
          to_address: transactionData.to_address?.toLowerCase(),
          contract_address: transactionData.contract_address?.toLowerCase(),
          method_name: transactionData.method_name,
          parameters: transactionData.parameters,
          gas_used: transactionData.gas_used,
          gas_price: transactionData.gas_price,
          block_number: transactionData.block_number,
          block_timestamp: transactionData.block_timestamp,
          status: transactionData.status || 'COMPLETED',
          error_message: transactionData.error_message
        })
        .select()
        .single();

      if (error) {
        console.error('⚠️ Failed to log transaction:', error);
      }

      return data;

    } catch (error) {
      console.error('⚠️ Transaction logging error:', error);
      return null;
    }
  }

  /**
   * Update daily analytics
   */
  async updateDailyAnalytics(eventType, value = 0) {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      // Get or create today's analytics record
      let { data: analytics, error: selectError } = await client
        .from('platform_analytics')
        .select('*')
        .eq('date', today)
        .single();

      if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('⚠️ Failed to fetch analytics:', selectError);
        return null;
      }

      const updates = {};
      const currentValue = parseInt(value) || 0;

      // Update based on event type
      switch (eventType) {
        case 'pledge_created':
          updates.total_pledges_created = (analytics?.total_pledges_created || 0) + 1;
          updates.total_value_pledged = (parseInt(analytics?.total_value_pledged || 0)) + currentValue;
          updates.active_pledges = (analytics?.active_pledges || 0) + 1;
          break;
        
        case 'tokens_purchased':
          updates.total_usdt_invested = (parseInt(analytics?.total_usdt_invested || 0)) + currentValue;
          break;
        
        case 'client_paid':
          updates.total_clients_paid = (parseInt(analytics?.total_clients_paid || 0)) + currentValue;
          break;
        
        default:
          console.log(`⚠️ Unknown analytics event type: ${eventType}`);
          return null;
      }

      if (analytics) {
        // Update existing record
        const { data, error } = await client
          .from('platform_analytics')
          .update(updates)
          .eq('date', today)
          .select()
          .single();

        if (error) {
          console.error('⚠️ Failed to update analytics:', error);
        }
        return data;
      } else {
        // Create new record
        const { data, error } = await client
          .from('platform_analytics')
          .insert({
            date: today,
            ...updates
          })
          .select()
          .single();

        if (error) {
          console.error('⚠️ Failed to create analytics:', error);
        }
        return data;
      }

    } catch (error) {
      console.error('⚠️ Analytics update error:', error);
      return null;
    }
  }

  /**
   * Get pledge agreements from database
   */
  async getPledgeAgreements(filters = {}) {
    try {
      if (!this.supabase.isInitialized()) {
        return [];
      }

      const client = this.supabase.getClient();
      let query = client.from('pledge_agreements').select('*');

      // Apply filters
      if (filters.clientAddress) {
        query = query.eq('client_address', filters.clientAddress.toLowerCase());
      }
      if (filters.status !== undefined) {
        query = query.eq('status', filters.status);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      // Order by creation date
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('❌ Failed to fetch pledge agreements:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }
  }

  /**
   * Get investor purchases from database
   */
  async getInvestorPurchases(filters = {}) {
    try {
      if (!this.supabase.isInitialized()) {
        return [];
      }

      const client = this.supabase.getClient();
      let query = client.from('investor_purchases').select('*');

      // Apply filters
      if (filters.investorAddress) {
        query = query.eq('investor_address', filters.investorAddress.toLowerCase());
      }
      if (filters.agreementId) {
        query = query.eq('agreement_id', filters.agreementId);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      // Order by creation date
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('❌ Failed to fetch investor purchases:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }
  }

  /**
   * Get platform analytics
   */
  async getPlatformAnalytics(days = 30) {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const { data, error } = await client
        .from('platform_analytics')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        console.error('❌ Failed to fetch platform analytics:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseSyncService;