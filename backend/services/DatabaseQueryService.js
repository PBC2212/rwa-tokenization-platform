const { ethers } = require('ethers');

/**
 * Database Query Service
 * Advanced querying and data analysis for the RWA platform
 */
class DatabaseQueryService {
  constructor(supabaseService) {
    this.supabase = supabaseService;
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData() {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();

      // Get totals
      const [pledgesResult, purchasesResult, paymentsResult, analyticsResult] = await Promise.all([
        client.from('pledge_agreements').select('*', { count: 'exact' }),
        client.from('investor_purchases').select('*', { count: 'exact' }),
        client.from('client_payments').select('*', { count: 'exact' }),
        client.from('platform_analytics').select('*').order('date', { ascending: false }).limit(1)
      ]);

      // Calculate totals from actual data
      const { data: allPledges } = await client.from('pledge_agreements').select('original_value, discounted_value, client_payment, status');
      const { data: allPurchases } = await client.from('investor_purchases').select('usdt_paid, token_amount');
      const { data: allPayments } = await client.from('client_payments').select('amount');

      const totalPledgedValue = allPledges?.reduce((sum, pledge) => sum + parseInt(pledge.original_value || 0), 0) || 0;
      const totalDiscountedValue = allPledges?.reduce((sum, pledge) => sum + parseInt(pledge.discounted_value || 0), 0) || 0;
      const totalInvestorPayments = allPurchases?.reduce((sum, purchase) => sum + parseInt(purchase.usdt_paid || 0), 0) || 0;
      const totalClientPayments = allPayments?.reduce((sum, payment) => sum + parseInt(payment.amount || 0), 0) || 0;
      const totalTokensSold = allPurchases?.reduce((sum, purchase) => sum + parseInt(purchase.token_amount || 0), 0) || 0;

      // Get active pledges count
      const activePledges = allPledges?.filter(pledge => pledge.status === 1).length || 0;

      // Get unique counts
      const uniqueClients = new Set(allPledges?.map(pledge => pledge.client_address) || []).size;
      const uniqueInvestors = new Set(allPurchases?.map(purchase => purchase.investor_address) || []).size;

      return {
        totals: {
          totalPledges: pledgesResult.count || 0,
          totalPurchases: purchasesResult.count || 0,
          totalPayments: paymentsResult.count || 0,
          activePledges,
          uniqueClients,
          uniqueInvestors
        },
        financial: {
          totalPledgedValue: ethers.utils.formatEther(totalPledgedValue.toString()),
          totalDiscountedValue: ethers.utils.formatEther(totalDiscountedValue.toString()),
          totalInvestorPayments: ethers.utils.formatUnits(totalInvestorPayments.toString(), 6),
          totalClientPayments: ethers.utils.formatUnits(totalClientPayments.toString(), 6),
          totalTokensSold: totalTokensSold.toString(),
          platformRevenue: ethers.utils.formatUnits((totalInvestorPayments * 0.15).toString(), 6) // 15% spread
        },
        latestAnalytics: analyticsResult.data?.[0] || null
      };

    } catch (error) {
      console.error('❌ Failed to get dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get pledge performance analytics
   */
  async getPledgePerformance() {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();

      // Get pledges with purchase data
      const { data, error } = await client
        .from('pledge_agreements')
        .select(`
          agreement_id,
          asset_type,
          original_value,
          discounted_value,
          tokens_issued,
          status,
          created_at,
          investor_purchases!inner(
            token_amount,
            usdt_paid,
            created_at
          )
        `);

      if (error) throw error;

      const performance = data?.map(pledge => {
        const totalInvested = pledge.investor_purchases?.reduce((sum, purchase) => 
          sum + parseInt(purchase.usdt_paid || 0), 0) || 0;
        const totalTokensSold = pledge.investor_purchases?.reduce((sum, purchase) => 
          sum + parseInt(purchase.token_amount || 0), 0) || 0;

        return {
          agreementId: pledge.agreement_id,
          assetType: pledge.asset_type,
          originalValue: ethers.utils.formatEther(pledge.original_value),
          discountedValue: ethers.utils.formatEther(pledge.discounted_value),
          totalInvested: ethers.utils.formatUnits(totalInvested.toString(), 6),
          totalTokensSold: totalTokensSold.toString(),
          tokensIssued: pledge.tokens_issued,
          salesPercentage: pledge.tokens_issued > 0 ? 
            ((totalTokensSold / parseInt(pledge.tokens_issued)) * 100).toFixed(2) : '0',
          status: pledge.status,
          createdAt: pledge.created_at
        };
      }) || [];

      return performance;

    } catch (error) {
      console.error('❌ Failed to get pledge performance:', error);
      throw error;
    }
  }

  /**
   * Get investor activity summary
   */
  async getInvestorActivity(investorAddress = null) {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();
      
      let query = client
        .from('investor_purchases')
        .select(`
          investor_address,
          token_amount,
          usdt_paid,
          created_at,
          pledge_agreements!inner(
            agreement_id,
            asset_type,
            original_value
          )
        `);

      if (investorAddress) {
        query = query.eq('investor_address', investorAddress.toLowerCase());
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Group by investor
      const investorSummary = {};
      
      data?.forEach(purchase => {
        const investor = purchase.investor_address;
        if (!investorSummary[investor]) {
          investorSummary[investor] = {
            address: investor,
            totalInvested: 0,
            totalTokens: 0,
            purchaseCount: 0,
            assetTypes: new Set(),
            firstPurchase: purchase.created_at,
            lastPurchase: purchase.created_at
          };
        }

        const summary = investorSummary[investor];
        summary.totalInvested += parseInt(purchase.usdt_paid || 0);
        summary.totalTokens += parseInt(purchase.token_amount || 0);
        summary.purchaseCount += 1;
        summary.assetTypes.add(purchase.pledge_agreements.asset_type);
        
        if (purchase.created_at < summary.firstPurchase) {
          summary.firstPurchase = purchase.created_at;
        }
        if (purchase.created_at > summary.lastPurchase) {
          summary.lastPurchase = purchase.created_at;
        }
      });

      // Format the results
      const formattedSummary = Object.values(investorSummary).map(summary => ({
        ...summary,
        totalInvested: ethers.utils.formatUnits(summary.totalInvested.toString(), 6),
        totalTokens: summary.totalTokens.toString(),
        assetTypes: Array.from(summary.assetTypes),
        averageInvestment: ethers.utils.formatUnits(
          Math.floor(parseInt(summary.totalInvested) / summary.purchaseCount).toString(), 6
        )
      }));

      return investorAddress ? formattedSummary[0] || null : formattedSummary;

    } catch (error) {
      console.error('❌ Failed to get investor activity:', error);
      throw error;
    }
  }

  /**
   * Get time-series data for charts
   */
  async getTimeSeriesData(days = 30) {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      // Get daily pledge creation data
      const { data: pledgeData, error: pledgeError } = await client
        .from('pledge_agreements')
        .select('created_at, original_value, discounted_value')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (pledgeError) throw pledgeError;

      // Get daily purchase data  
      const { data: purchaseData, error: purchaseError } = await client
        .from('investor_purchases')
        .select('created_at, usdt_paid, token_amount')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (purchaseError) throw purchaseError;

      // Group by date
      const dailyData = {};

      // Initialize all dates
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyData[dateStr] = {
          date: dateStr,
          pledgesCreated: 0,
          totalPledgedValue: 0,
          totalPurchases: 0,
          totalInvested: 0,
          tokensTraded: 0
        };
      }

      // Aggregate pledge data
      pledgeData?.forEach(pledge => {
        const date = pledge.created_at.split('T')[0];
        if (dailyData[date]) {
          dailyData[date].pledgesCreated += 1;
          dailyData[date].totalPledgedValue += parseInt(pledge.original_value || 0);
        }
      });

      // Aggregate purchase data
      purchaseData?.forEach(purchase => {
        const date = purchase.created_at.split('T')[0];
        if (dailyData[date]) {
          dailyData[date].totalPurchases += 1;
          dailyData[date].totalInvested += parseInt(purchase.usdt_paid || 0);
          dailyData[date].tokensTraded += parseInt(purchase.token_amount || 0);
        }
      });

      // Format values
      const formattedData = Object.values(dailyData).map(day => ({
        ...day,
        totalPledgedValue: ethers.utils.formatEther(day.totalPledgedValue.toString()),
        totalInvested: ethers.utils.formatUnits(day.totalInvested.toString(), 6),
        tokensTraded: day.tokensTraded.toString()
      }));

      return formattedData;

    } catch (error) {
      console.error('❌ Failed to get time series data:', error);
      throw error;
    }
  }

  /**
   * Search pledges and purchases
   */
  async searchTransactions(searchQuery, type = 'all') {
    try {
      if (!this.supabase.isInitialized()) {
        return null;
      }

      const client = this.supabase.getClient();
      const results = { pledges: [], purchases: [], payments: [] };

      // Search pledges
      if (type === 'all' || type === 'pledges') {
        const { data: pledges } = await client
          .from('pledge_agreements')
          .select('*')
          .or(`agreement_id.ilike.%${searchQuery}%,client_address.ilike.%${searchQuery}%,asset_type.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .limit(20);
        
        results.pledges = pledges || [];
      }

      // Search purchases
      if (type === 'all' || type === 'purchases') {
        const { data: purchases } = await client
          .from('investor_purchases')
          .select('*')
          .or(`purchase_id.ilike.%${searchQuery}%,agreement_id.ilike.%${searchQuery}%,investor_address.ilike.%${searchQuery}%`)
          .limit(20);
        
        results.purchases = purchases || [];
      }

      // Search payments
      if (type === 'all' || type === 'payments') {
        const { data: payments } = await client
          .from('client_payments')
          .select('*')
          .or(`agreement_id.ilike.%${searchQuery}%,client_address.ilike.%${searchQuery}%`)
          .limit(20);
        
        results.payments = payments || [];
      }

      return results;

    } catch (error) {
      console.error('❌ Failed to search transactions:', error);
      throw error;
    }
  }

  /**
   * Get transaction logs with filters
   */
  async getTransactionLogs(filters = {}) {
    try {
      if (!this.supabase.isInitialized()) {
        return [];
      }

      const client = this.supabase.getClient();
      let query = client.from('transaction_log').select('*');

      // Apply filters
      if (filters.transactionType) {
        query = query.eq('transaction_type', filters.transactionType);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.fromAddress) {
        query = query.eq('from_address', filters.fromAddress.toLowerCase());
      }
      if (filters.toAddress) {
        query = query.eq('to_address', filters.toAddress.toLowerCase());
      }
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      // Pagination
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('❌ Failed to get transaction logs:', error);
      throw error;
    }
  }
}

module.exports = DatabaseQueryService;