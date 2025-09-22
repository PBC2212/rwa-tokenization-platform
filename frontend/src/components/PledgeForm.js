import React, { useState } from 'react';
import apiService from '../services/api';

const PledgeForm = ({ onNotify, contractInfo }) => {
  const [formData, setFormData] = useState({
    clientAddress: '',
    assetType: '',
    description: '',
    originalValue: '',
    documentHash: ''
  });
  const [loading, setLoading] = useState(false);
  const [createdPledge, setCreatedPledge] = useState(null);
  const [showPayment, setShowPayment] = useState(false);

  const assetTypes = [
    { value: 'real_estate', label: 'Real Estate', icon: '🏠' },
    { value: 'stocks', label: 'Stocks & Securities', icon: '📈' },
    { value: 'bonds', label: 'Bonds', icon: '📊' },
    { value: 'commodities', label: 'Commodities', icon: '🥇' },
    { value: 'vehicles', label: 'Vehicles', icon: '🚗' },
    { value: 'art', label: 'Art & Collectibles', icon: '🎨' },
    { value: 'equipment', label: 'Equipment & Machinery', icon: '⚙️' },
    { value: 'other', label: 'Other Assets', icon: '📦' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.clientAddress.trim()) {
      errors.push('Client address is required');
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.clientAddress.trim())) {
      errors.push('Client address must be a valid Ethereum address');
    }
    
    if (!formData.assetType) {
      errors.push('Asset type is required');
    }
    
    if (!formData.description.trim()) {
      errors.push('Asset description is required');
    }
    
    if (!formData.originalValue || isNaN(formData.originalValue) || parseFloat(formData.originalValue) <= 0) {
      errors.push('Original value must be a positive number');
    }
    
    return errors;
  };

  const calculateProjections = () => {
    if (!formData.originalValue || !contractInfo) return null;
    
    const originalValue = parseFloat(formData.originalValue);
    const discountRate = parseInt(contractInfo.rwaToken.discountRate) / 100;
    const spreadPercentage = parseInt(contractInfo.pledgeManager.spreadPercentage) / 100;
    
    const discountedValue = originalValue * discountRate;
    const clientPayment = discountedValue * (1 - spreadPercentage);
    const platformRevenue = discountedValue * spreadPercentage;
    const tokensIssued = Math.floor(discountedValue);
    
    return {
      originalValue,
      discountedValue,
      clientPayment,
      platformRevenue,
      tokensIssued,
      discountRate: discountRate * 100,
      spreadPercentage: spreadPercentage * 100
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach(error => onNotify(error, 'error'));
      return;
    }
    
    setLoading(true);
    try {
      const pledgeData = {
        clientAddress: formData.clientAddress.trim(),
        assetType: formData.assetType,
        description: formData.description.trim(),
        originalValue: parseFloat(formData.originalValue),
        documentHash: formData.documentHash.trim() || `ipfs_hash_${Date.now()}`
      };
      
      onNotify('Creating pledge agreement...', 'info');
      const result = await apiService.createPledge(pledgeData);
      
      setCreatedPledge(result);
      setShowPayment(true);
      onNotify('Pledge agreement created successfully!', 'success');
      
      // Reset form
      setFormData({
        clientAddress: '',
        assetType: '',
        description: '',
        originalValue: '',
        documentHash: ''
      });
      
    } catch (error) {
      onNotify('Failed to create pledge: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePayClient = async () => {
    if (!createdPledge) return;
    
    setLoading(true);
    try {
      onNotify('Processing client payment...', 'info');
      const result = await apiService.payClient(createdPledge.agreementId);
      
      onNotify('Client payment processed successfully!', 'success');
      setShowPayment(false);
      setCreatedPledge(null);
      
    } catch (error) {
      onNotify('Failed to pay client: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const projections = calculateProjections();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Create Pledge Agreement</h2>
        <p className="text-gray-600 mt-1">Tokenize real-world assets by creating a pledge agreement</p>
      </div>

      {/* Success Message */}
      {createdPledge && !showPayment && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">✅</span>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-green-800">Pledge Created Successfully!</h3>
              <p className="text-green-700">Agreement ID: {createdPledge.agreementId}</p>
              <p className="text-green-700">Transaction: {createdPledge.transactionHash}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Processing */}
      {showPayment && createdPledge && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Ready to Pay Client</h3>
            <div className="bg-white rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Client:</span>
                  <p className="font-mono text-gray-900">{createdPledge.pledge.client}</p>
                </div>
                <div>
                  <span className="text-gray-500">Payment Amount:</span>
                  <p className="font-bold text-green-600">${createdPledge.pledge.clientPayment} USDT</p>
                </div>
                <div>
                  <span className="text-gray-500">Tokens Issued:</span>
                  <p className="font-medium">{createdPledge.pledge.tokensIssued} RWAT</p>
                </div>
                <div>
                  <span className="text-gray-500">Asset Type:</span>
                  <p className="font-medium">{createdPledge.pledge.assetType}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handlePayClient}
              disabled={loading}
              className="btn-primary text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Processing Payment...' : `Pay Client $${createdPledge.pledge.clientPayment} USDT`}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Asset Information</h3>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Client Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Wallet Address *
              </label>
              <input
                type="text"
                name="clientAddress"
                value={formData.clientAddress}
                onChange={handleInputChange}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                The wallet address of the asset owner
              </p>
            </div>

            {/* Asset Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Asset Type *
              </label>
              <select
                name="assetType"
                value={formData.assetType}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="">Select asset type...</option>
                {assetTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Asset Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                placeholder="Detailed description of the asset..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Include location, condition, and key details
              </p>
            </div>

            {/* Original Value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Original Asset Value (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  name="originalValue"
                  value={formData.originalValue}
                  onChange={handleInputChange}
                  placeholder="100000"
                  min="1"
                  step="0.01"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Market value or appraised value of the asset
              </p>
            </div>

            {/* Document Hash */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Hash (Optional)
              </label>
              <input
                type="text"
                name="documentHash"
                value={formData.documentHash}
                onChange={handleInputChange}
                placeholder="QmHash... (IPFS hash)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                IPFS hash of legal documents and proofs
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || showPayment}
              className="w-full btn-primary text-white py-3 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Pledge...' : 'Create Pledge Agreement'}
            </button>
          </form>
        </div>

        {/* Projections */}
        <div className="space-y-6">
          {projections && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Financial Projections</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Original Asset Value:</span>
                  <span className="font-semibold">${projections.originalValue.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Discount Rate:</span>
                  <span className="font-medium text-blue-600">{projections.discountRate}%</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Discounted Value:</span>
                  <span className="font-semibold">${projections.discountedValue.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Platform Spread:</span>
                  <span className="font-medium text-yellow-600">{projections.spreadPercentage}%</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Client Payment:</span>
                  <span className="font-bold text-green-600">${projections.clientPayment.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Platform Revenue:</span>
                  <span className="font-bold text-purple-600">${projections.platformRevenue.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Tokens to Issue:</span>
                  <span className="font-bold text-indigo-600">{projections.tokensIssued.toLocaleString()} RWAT</span>
                </div>
              </div>
            </div>
          )}

          {/* How it Works */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <p>Client pledges their real-world asset as collateral</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <p>Asset is valued at a discount (typically 70% of market value)</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <p>Digital tokens are minted representing the discounted value</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                <p>Client receives immediate payment minus platform spread</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">5</span>
                <p>Tokens can be sold to investors for exposure to the asset</p>
              </div>
            </div>
          </div>

          {/* Risk Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-yellow-600">⚠️</span>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800">Important Notice</h4>
                <p className="text-xs text-yellow-700 mt-1">
                  This is a demo platform. In production, proper legal documentation, 
                  asset verification, and regulatory compliance would be required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PledgeForm;