import React, { useState, useEffect } from 'react';
import apiService from '../services/api';

const Dashboard = ({ onNotify, onRefresh, systemHealth, contractInfo }) => {
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalValue: 0,
    activeTokens: 0,
    totalRevenue: 0
  });
  const [pledgeManagerBalance, setPledgeManagerBalance] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contractInfo) {
      updateStats();
    }
    loadPledgeManagerBalance();
  }, [contractInfo]);

  const updateStats = () => {
    if (contractInfo) {
      setStats({
        totalAssets: Math.floor(Math.random() * 50) + 10, // Simulated data
        totalValue: parseFloat(contractInfo.rwaToken.totalPledgedValue) || 0,
        activeTokens: parseFloat(contractInfo.rwaToken.totalSupply) || 0,
        totalRevenue: parseFloat(contractInfo.pledgeManager.platformRevenue) || 0
      });
    }
  };

  const loadPledgeManagerBalance = async () => {
    try {
      const response = await fetch('/api/admin/pledge-manager-balance');
      const data = await response.json();
      if (data.success) {
        setPledgeManagerBalance(data.usdtBalance);
      }
    } catch (error) {
      console.error('Failed to load PledgeManager balance:', error);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await onRefresh();
      await loadPledgeManagerBalance();
      onNotify('Dashboard refreshed successfully', 'success');
    } catch (error) {
      onNotify('Failed to refresh dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGetTestTokens = async () => {
    try {
      setLoading(true);
      // Use a test address for demo
      const testAddress = '0x7931edfa6255D59AEe5A65D26E6a7e3CF30E8339';
      const result = await apiService.getFreeUSDT(testAddress);
      onNotify(`Success! ${result.amount} USDT sent to test address`, 'success');
    } catch (error) {
      onNotify('Failed to get test tokens: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFundPledgeManager = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/fund-pledge-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: '500000' })
      });
      
      const result = await response.json();
      if (result.success) {
        onNotify(`Funded PledgeManager with ${result.amountTransferred} USDT`, 'success');
        setPledgeManagerBalance(result.newBalance);
      } else {
        throw new Error(result.error || 'Failed to fund PledgeManager');
      }
    } catch (error) {
      onNotify('Failed to fund PledgeManager: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkPledgeManagerBalance = async () => {
    try {
      setLoading(true);
      await loadPledgeManagerBalance();
      onNotify('PledgeManager balance updated', 'success');
    } catch (error) {
      onNotify('Failed to check balance: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, subtitle, icon, color = 'blue' }) => (
    <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-${color}-500`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 bg-${color}-100 rounded-md flex items-center justify-center`}>
            <span className="text-2xl">{icon}</span>
          </div>
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="text-lg font-medium text-gray-900">{value}</dd>
            {subtitle && <dd className="text-sm text-gray-500">{subtitle}</dd>}
          </dl>
        </div>
      </div>
    </div>
  );

  const ActionCard = ({ title, description, buttonText, onClick, disabled = false, color = 'indigo' }) => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`btn-primary text-white px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
          disabled ? 'bg-gray-400' : `bg-${color}-600 hover:bg-${color}-700`
        }`}
      >
        {loading ? 'Processing...' : buttonText}
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Platform Dashboard</h2>
          <p className="text-gray-600 mt-1">Overview of your RWA tokenization platform</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="bg-white border border-gray-300 rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* PledgeManager Balance Alert */}
      {pledgeManagerBalance !== null && (
        <div className={`rounded-lg p-4 ${
          parseFloat(pledgeManagerBalance) < 100000 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-2xl mr-3">
                {parseFloat(pledgeManagerBalance) < 100000 ? '⚠️' : '✅'}
              </span>
              <div>
                <h4 className={`font-medium ${
                  parseFloat(pledgeManagerBalance) < 100000 ? 'text-red-900' : 'text-green-900'
                }`}>
                  PledgeManager USDT Balance
                </h4>
                <p className={`text-sm ${
                  parseFloat(pledgeManagerBalance) < 100000 ? 'text-red-700' : 'text-green-700'
                }`}>
                  Current balance: {parseFloat(pledgeManagerBalance).toLocaleString()} USDT
                  {parseFloat(pledgeManagerBalance) < 100000 && ' (Low balance - fund needed for client payments)'}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={checkPledgeManagerBalance}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
              >
                Check Balance
              </button>
              {parseFloat(pledgeManagerBalance) < 100000 && (
                <button
                  onClick={handleFundPledgeManager}
                  disabled={loading}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
                >
                  Fund PledgeManager
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System Status */}
      {systemHealth && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Blockchain Connection</p>
                <p className="text-sm text-gray-500">Connected to {systemHealth.network}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">⛓️</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Chain ID</p>
                <p className="text-sm text-gray-500">{systemHealth.chainId}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-purple-600">💰</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Balance</p>
                <p className="text-sm text-gray-500">{parseFloat(systemHealth.balance).toFixed(4)} MATIC</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Assets"
          value={stats.totalAssets}
          subtitle="Pledged assets"
          icon="🏠"
          color="green"
        />
        
        <StatCard
          title="Total Value Locked"
          value={`$${stats.totalValue.toFixed(0)}`}
          subtitle="In pledged assets"
          icon="💎"
          color="blue"
        />
        
        <StatCard
          title="Active Tokens"
          value={stats.activeTokens.toFixed(0)}
          subtitle="RWAT tokens in circulation"
          icon="🪙"
          color="purple"
        />
        
        <StatCard
          title="Platform Revenue"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          subtitle="Total earnings"
          icon="💰"
          color="yellow"
        />
      </div>

      {/* Contract Information */}
      {contractInfo && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contract Information</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">RWA Token Contract</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{contractInfo.rwaToken.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Symbol:</span>
                  <span className="font-medium">{contractInfo.rwaToken.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount Rate:</span>
                  <span className="font-medium">{contractInfo.rwaToken.discountRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Supply:</span>
                  <span className="font-medium">{parseFloat(contractInfo.rwaToken.totalSupply).toFixed(0)}</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Platform Metrics</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Client Payments:</span>
                  <span className="font-medium">${parseFloat(contractInfo.pledgeManager.totalClientPayments).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Investor Payments:</span>
                  <span className="font-medium">${parseFloat(contractInfo.pledgeManager.totalInvestorPayments).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Platform Spread:</span>
                  <span className="font-medium">{contractInfo.pledgeManager.spreadPercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Revenue:</span>
                  <span className="font-medium text-green-600">${parseFloat(contractInfo.pledgeManager.platformRevenue).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ActionCard
          title="Fund PledgeManager"
          description="Add USDT to PledgeManager for client payments"
          buttonText="Fund with 500K USDT"
          onClick={handleFundPledgeManager}
          color="yellow"
        />
        
        <ActionCard
          title="Get Test USDT"
          description="Get free USDT tokens for testing the platform"
          buttonText="Get 10,000 USDT"
          onClick={handleGetTestTokens}
          color="green"
        />
        
        <ActionCard
          title="Create New Pledge"
          description="Start the process of tokenizing a real-world asset"
          buttonText="Create Pledge"
          onClick={() => window.location.hash = '#pledge'}
          color="blue"
        />
      </div>

      {/* Contract Addresses */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Contract Addresses</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-700">RWA Token:</p>
            <p className="text-gray-600 font-mono break-all">{systemHealth?.contracts?.rwaToken}</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">Pledge Manager:</p>
            <p className="text-gray-600 font-mono break-all">{systemHealth?.contracts?.pledgeManager}</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">USDT Token:</p>
            <p className="text-gray-600 font-mono break-all">{systemHealth?.contracts?.usdt}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;