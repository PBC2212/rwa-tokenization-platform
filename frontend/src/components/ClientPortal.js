import React, { useState, useEffect } from 'react';
import apiService from '../services/api';

const ClientPortal = ({ onNotify }) => {
  const [clientAddress, setClientAddress] = useState('');
  const [clientPledges, setClientPledges] = useState([]);
  const [selectedPledge, setSelectedPledge] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const loadClientPledges = async (address) => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
      onNotify('Please enter a valid wallet address', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await apiService.getClientPledges(address.trim());
      setClientPledges(result.pledges || []);
      setSearchPerformed(true);
      
      if (result.pledges?.length === 0) {
        onNotify('No pledges found for this address', 'info');
      } else {
        onNotify(`Found ${result.pledges.length} pledge(s)`, 'success');
      }
    } catch (error) {
      onNotify('Failed to load pledges: ' + error.message, 'error');
      setClientPledges([]);
      setSearchPerformed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadPledgeDetails = async (agreementId) => {
    setLoading(true);
    try {
      const result = await apiService.getPledgeDetails(agreementId);
      setSelectedPledge(result);
    } catch (error) {
      onNotify('Failed to load pledge details: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 0: return 'bg-yellow-100 text-yellow-800'; // PENDING
      case 1: return 'bg-green-100 text-green-800'; // ACTIVE
      case 2: return 'bg-blue-100 text-blue-800'; // REPAID
      case 3: return 'bg-red-100 text-red-800'; // DEFAULTED
      case 4: return 'bg-gray-100 text-gray-800'; // RELEASED
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 0: return 'Pending';
      case 1: return 'Active';
      case 2: return 'Repaid';
      case 3: return 'Defaulted';
      case 4: return 'Released';
      default: return 'Unknown';
    }
  };

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

  const handleSearch = (e) => {
    e.preventDefault();
    loadClientPledges(clientAddress);
  };

  const PledgeCard = ({ pledge }) => (
    <div 
      className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => loadPledgeDetails(pledge.agreementId)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{getAssetIcon(pledge.assetType)}</span>
          <div>
            <h3 className="font-semibold text-gray-900 capitalize">
              {pledge.assetType.replace('_', ' ')}
            </h3>
            <p className="text-sm text-gray-500">
              {new Date(parseInt(pledge.timestamp) * 1000).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(pledge.status)}`}>
          {getStatusText(pledge.status)}
        </span>
      </div>
      
      <p className="text-gray-700 mb-4 line-clamp-2">{pledge.description}</p>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Original Value:</span>
          <p className="font-medium">${parseFloat(pledge.originalValue).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-gray-500">You Received:</span>
          <p className="font-bold text-green-600">${parseFloat(pledge.clientPayment).toLocaleString()}</p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">Agreement ID: {pledge.agreementId}</p>
      </div>
    </div>
  );

  const PledgeDetails = ({ pledge }) => (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{getAssetIcon(pledge.pledge.assetType)}</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 capitalize">
                {pledge.pledge.assetType.replace('_', ' ')}
              </h2>
              <p className="text-gray-500">Agreement: {pledge.pledge.agreementId}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(pledge.pledge.status)}`}>
            {getStatusText(pledge.pledge.status)}
          </span>
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Asset Description */}
        <div>
          <h3 className="font-medium text-gray-900 mb-2">Asset Description</h3>
          <p className="text-gray-700">{pledge.pledge.description}</p>
        </div>
        
        {/* Financial Details */}
        <div>
          <h3 className="font-medium text-gray-900 mb-4">Financial Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Original Asset Value:</span>
                <span className="font-medium">${parseFloat(pledge.pledge.originalValue).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Discounted Value:</span>
                <span className="font-medium">${parseFloat(pledge.pledge.discountedValue).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tokens Issued:</span>
                <span className="font-medium">{pledge.pledge.tokensIssued} RWAT</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">You Received:</span>
                <span className="font-bold text-green-600">${parseFloat(pledge.pledge.clientPayment).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pledge Date:</span>
                <span className="font-medium">
                  {new Date(parseInt(pledge.pledge.timestamp) * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Asset ID:</span>
                <span className="font-mono text-sm">{pledge.pledge.assetId}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Investors */}
        {pledge.investors && pledge.investors.length > 0 && (
          <div>
            <h3 className="font-medium text-gray-900 mb-4">Token Investors</h3>
            <div className="space-y-3">
              {pledge.investors.map((investor, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-mono text-sm text-gray-600">{investor.investor}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(parseInt(investor.timestamp) * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{investor.tokenAmount} tokens</p>
                      <p className="text-sm text-gray-500">${parseFloat(investor.usdtPaid).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Document Hash */}
        {pledge.pledge.documentHash && (
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Document Hash</h3>
            <p className="font-mono text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              {pledge.pledge.documentHash}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              IPFS hash of legal documents and proofs
            </p>
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => setSelectedPledge(null)}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            ← Back to Pledges
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Client Portal</h2>
        <p className="text-gray-600 mt-1">View and manage your asset pledges</p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Find Your Pledges</h3>
        <form onSubmit={handleSearch} className="flex space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Wallet Address
            </label>
            <input
              type="text"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search Pledges'}
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-sm text-gray-500">
          <p>💡 Enter the wallet address used when creating pledge agreements</p>
        </div>
      </div>

      {/* Results */}
      {searchPerformed && (
        <>
          {selectedPledge ? (
            <PledgeDetails pledge={selectedPledge} />
          ) : (
            <div className="space-y-6">
              {clientPledges.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">
                      Your Pledges ({clientPledges.length})
                    </h3>
                    <div className="text-sm text-gray-500">
                      Click on any pledge to view details
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clientPledges.map((pledge, index) => (
                      <PledgeCard key={index} pledge={pledge} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <span className="text-6xl mb-4 block">🔍</span>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Pledges Found</h3>
                  <p className="text-gray-600 mb-6">
                    No pledge agreements found for this wallet address.
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <p>• Make sure you're using the correct wallet address</p>
                    <p>• Pledges may take a few minutes to appear after creation</p>
                    <p>• Contact support if you believe this is an error</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Help Section */}
      {!searchPerformed && (
        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">How to Use Client Portal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
            <div>
              <h4 className="font-medium mb-2">📋 View Your Pledges</h4>
              <p>Enter your wallet address to see all your active and completed pledge agreements.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">💰 Track Payments</h4>
              <p>See how much you received for each asset and monitor the status of your agreements.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">👥 Monitor Investors</h4>
              <p>View who has invested in your tokenized assets and how much they've contributed.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">📄 Document Verification</h4>
              <p>Access document hashes and verify the authenticity of your pledge agreements.</p>
            </div>
          </div>
        </div>
      )}

      {/* Sample Address for Testing */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium text-gray-900 mb-2">🧪 For Testing</h3>
        <p className="text-sm text-gray-600 mb-3">
          Use this sample address to test the client portal:
        </p>
        <div className="flex items-center space-x-2">
          <code className="bg-white px-3 py-1 rounded border text-sm font-mono">
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
          </code>
          <button
            onClick={() => {
              setClientAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
              loadClientPledges('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
            }}
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
          >
            Use This Address
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientPortal;