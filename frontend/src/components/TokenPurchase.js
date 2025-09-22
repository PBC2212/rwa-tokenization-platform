import React, { useState, useEffect } from 'react';
import apiService from '../services/api';

const TokenPurchase = ({ onNotify, contractInfo }) => {
  const [availableAssets, setAvailableAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [investorAddress, setInvestorAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('marketplace');
  const [investorPortfolio, setInvestorPortfolio] = useState([]);

  // Mock data for demonstration - in production this would come from the backend
  const mockAvailableAssets = [
    {
      agreementId: 'agreement_1',
      assetType: 'real_estate',
      description: 'Luxury apartment in Manhattan, NYC. 2BR/2BA with city views.',
      originalValue: 500000,
      discountedValue: 350000,
      tokensAvailable: 350000,
      tokensSold: 120000,
      clientAddress: '0x1234...5678',
      location: 'New York, NY',
      yield: '8.5%',
      riskLevel: 'Medium'
    },
    {
      agreementId: 'agreement_2',
      assetType: 'stocks',
      description: 'Tesla stock portfolio - 100 shares of TSLA',
      originalValue: 25000,
      discountedValue: 17500,
      tokensAvailable: 17500,
      tokensSold: 5000,
      clientAddress: '0xabcd...efgh',
      location: 'Stock Market',
      yield: '12.3%',
      riskLevel: 'High'
    },
    {
      agreementId: 'agreement_3',
      assetType: 'art',
      description: 'Contemporary art collection featuring emerging artists',
      originalValue: 75000,
      discountedValue: 52500,
      tokensAvailable: 52500,
      tokensSold: 15000,
      clientAddress: '0x9876...5432',
      location: 'Gallery District',
      yield: '6.2%',
      riskLevel: 'Low'
    }
  ];

  useEffect(() => {
    setAvailableAssets(mockAvailableAssets);
    // In production, load real data:
    // loadAvailableAssets();
  }, []);

  const getAssetIcon = (assetType) => {
    const icons = {
      real_estate: '🏠',
      stocks: '📈',
      bonds: '📊',
      commodities: '🥇',
      vehicles: '🚗',
      art: '🎨',
      equipment: '⚙️',
      other: '📦'
    };
    return icons[assetType] || '📦';
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'Low': return 'text-green-600 bg-green-100';
      case 'Medium': return 'text-yellow-600 bg-yellow-100';
      case 'High': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const calculatePurchaseDetails = () => {
    if (!selectedAsset || !purchaseAmount) return null;
    
    const amount = parseFloat(purchaseAmount);
    const usdtCost = amount; // 1 token = 1 USD
    const percentageOfAsset = (amount / selectedAsset.tokensAvailable) * 100;
    
    return {
      tokenAmount: amount,
      usdtCost: usdtCost,
      percentageOfAsset: percentageOfAsset,
      estimatedYield: (usdtCost * (parseFloat(selectedAsset.yield) / 100))
    };
  };

  const handlePurchase = async () => {
    if (!selectedAsset || !purchaseAmount || !investorAddress) {
      onNotify('Please fill in all required fields', 'error');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(investorAddress.trim())) {
      onNotify('Please enter a valid investor address', 'error');
      return;
    }

    const amount = parseFloat(purchaseAmount);
    if (amount <= 0 || amount > (selectedAsset.tokensAvailable - selectedAsset.tokensSold)) {
      onNotify('Invalid purchase amount', 'error');
      return;
    }

    setLoading(true);
    try {
      onNotify('Processing token purchase...', 'info');
      
      const purchaseData = {
        agreementId: selectedAsset.agreementId,
        tokenAmount: amount,
        investorAddress: investorAddress.trim()
      };

      const result = await apiService.purchaseTokens(purchaseData);
      
      onNotify(`Successfully purchased ${amount} tokens!`, 'success');
      
      // Update available tokens
      setAvailableAssets(prev => 
        prev.map(asset => 
          asset.agreementId === selectedAsset.agreementId
            ? { ...asset, tokensSold: asset.tokensSold + amount }
            : asset
        )
      );
      
      // Reset form
      setSelectedAsset(null);
      setPurchaseAmount('');
      setInvestorAddress('');
      
    } catch (error) {
      onNotify('Purchase failed: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const AssetCard = ({ asset, isSelected, onClick }) => {
    const availableTokens = asset.tokensAvailable - asset.tokensSold;
    const soldPercentage = (asset.tokensSold / asset.tokensAvailable) * 100;
    
    return (
      <div
        className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all hover:shadow-lg ${
          isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''
        }`}
        onClick={() => onClick(asset)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{getAssetIcon(asset.assetType)}</span>
            <div>
              <h3 className="font-semibold text-gray-900 capitalize">
                {asset.assetType.replace('_', ' ')}
              </h3>
              <p className="text-sm text-gray-500">{asset.location}</p>
            </div>
          </div>
          <div className="text-right">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(asset.riskLevel)}`}>
              {asset.riskLevel} Risk
            </span>
          </div>
        </div>
        
        <p className="text-gray-700 mb-4 line-clamp-2">{asset.description}</p>
        
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Original Value:</span>
            <span className="font-medium">${asset.originalValue.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Token Value:</span>
            <span className="font-bold text-green-600">${asset.discountedValue.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Expected Yield:</span>
            <span className="font-bold text-blue-600">{asset.yield}</span>
          </div>
          
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Available: {availableTokens.toLocaleString()} tokens</span>
              <span>{soldPercentage.toFixed(1)}% sold</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full" 
                style={{ width: `${soldPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const purchaseDetails = calculatePurchaseDetails();

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Token Marketplace</h2>
        <p className="text-gray-600 mt-1">Invest in tokenized real-world assets</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'marketplace'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🛒 Marketplace
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'portfolio'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            💼 My Portfolio
          </button>
        </nav>
      </div>

      {activeTab === 'marketplace' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Available Assets */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Available Assets</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {availableAssets.map(asset => (
                  <AssetCard
                    key={asset.agreementId}
                    asset={asset}
                    isSelected={selectedAsset?.agreementId === asset.agreementId}
                    onClick={setSelectedAsset}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Purchase Panel */}
          <div className="space-y-6">
            {selectedAsset ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Purchase Tokens</h3>
                
                <div className="space-y-4">
                  {/* Selected Asset Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-xl">{getAssetIcon(selectedAsset.assetType)}</span>
                      <span className="font-medium capitalize">{selectedAsset.assetType.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{selectedAsset.description}</p>
                    <div className="text-xs text-gray-500">
                      Available: {(selectedAsset.tokensAvailable - selectedAsset.tokensSold).toLocaleString()} tokens
                    </div>
                  </div>

                  {/* Investor Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Your Wallet Address *
                    </label>
                    <input
                      type="text"
                      value={investorAddress}
                      onChange={(e) => setInvestorAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  {/* Purchase Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Tokens
                    </label>
                    <input
                      type="number"
                      value={purchaseAmount}
                      onChange={(e) => setPurchaseAmount(e.target.value)}
                      placeholder="1000"
                      min="1"
                      max={selectedAsset.tokensAvailable - selectedAsset.tokensSold}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      1 token = $1 USD
                    </p>
                  </div>

                  {/* Purchase Summary */}
                  {purchaseDetails && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-3">Purchase Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-700">Tokens:</span>
                          <span className="font-medium">{purchaseDetails.tokenAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Cost:</span>
                          <span className="font-medium">${purchaseDetails.usdtCost.toLocaleString()} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Asset Share:</span>
                          <span className="font-medium">{purchaseDetails.percentageOfAsset.toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Est. Annual Yield:</span>
                          <span className="font-medium text-green-600">${purchaseDetails.estimatedYield.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Purchase Button */}
                  <button
                    onClick={handlePurchase}
                    disabled={loading || !purchaseAmount || !investorAddress}
                    className="w-full btn-primary text-white py-3 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing Purchase...' : 'Purchase Tokens'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <span className="text-4xl mb-4 block">🎯</span>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Asset</h3>
                <p className="text-gray-600">Choose an asset from the marketplace to start investing</p>
              </div>
            )}

            {/* Investment Tips */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-3">💡 Investment Tips</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Start with lower-risk assets if you're new to RWA investing</li>
                <li>• Diversify across different asset types</li>
                <li>• Consider the location and market conditions</li>
                <li>• Review expected yields and risk ratings</li>
                <li>• Only invest what you can afford to lose</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'portfolio' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">My Investment Portfolio</h3>
          
          {investorPortfolio.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-6xl mb-4 block">📊</span>
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Investments Yet</h4>
              <p className="text-gray-600 mb-6">Start investing in tokenized assets to build your portfolio</p>
              <button
                onClick={() => setActiveTab('marketplace')}
                className="btn-primary text-white px-6 py-2 rounded-md font-medium"
              >
                Browse Assets
              </button>
            </div>
          ) : (
            <div>
              {/* Portfolio stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">$0</div>
                  <div className="text-sm text-blue-700">Total Invested</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">$0</div>
                  <div className="text-sm text-green-700">Current Value</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">0%</div>
                  <div className="text-sm text-purple-700">Total Return</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-yellow-600">0</div>
                  <div className="text-sm text-yellow-700">Assets Owned</div>
                </div>
              </div>
              
              {/* Portfolio items would be listed here */}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenPurchase;