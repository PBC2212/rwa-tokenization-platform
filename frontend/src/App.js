import React, { useState, useEffect } from 'react';
import apiService from './services/api';

// Component imports (we'll create these next)
import Dashboard from './components/Dashboard';
import PledgeForm from './components/PledgeForm';
import TokenPurchase from './components/TokenPurchase';
import ClientPortal from './components/ClientPortal';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemHealth, setSystemHealth] = useState(null);
  const [contractInfo, setContractInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // Load initial data
  useEffect(() => {
    loadSystemData();
  }, []);

  const loadSystemData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load system health and contract info
      const [healthData, contractData] = await Promise.all([
        apiService.getHealth(),
        apiService.getContractInfo()
      ]);

      setSystemHealth(healthData);
      setContractInfo(contractData);
      
      addNotification('System loaded successfully', 'success');
    } catch (err) {
      console.error('Failed to load system data:', err);
      setError('Failed to connect to the system. Please ensure the backend is running.');
      addNotification('Failed to load system data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Notification system
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    const notification = { id, message, type, timestamp: new Date() };
    setNotifications(prev => [notification, ...prev.slice(0, 4)]); // Keep only 5 notifications

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Tab navigation
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'pledge', label: 'Create Pledge', icon: '📄' },
    { id: 'invest', label: 'Invest', icon: '💰' },
    { id: 'client', label: 'Client Portal', icon: '👤' }
  ];

  const renderActiveComponent = () => {
    const componentProps = {
      onNotify: addNotification,
      onRefresh: loadSystemData,
      systemHealth,
      contractInfo
    };

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard {...componentProps} />;
      case 'pledge':
        return <PledgeForm {...componentProps} />;
      case 'invest':
        return <TokenPurchase {...componentProps} />;
      case 'client':
        return <ClientPortal {...componentProps} />;
      default:
        return <Dashboard {...componentProps} />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold mb-2">Loading RWA Platform...</h2>
          <p className="text-lg opacity-80">Connecting to blockchain...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="gradient-bg text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">RWA Tokenization Platform</h1>
              <p className="text-lg opacity-80">Convert Real-World Assets into Digital Tokens</p>
            </div>
            
            {/* System Status */}
            {systemHealth && (
              <div className="text-right">
                <div className="flex items-center space-x-2 mb-1">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm">Network: {systemHealth.network}</span>
                </div>
                <div className="text-xs opacity-75">
                  Balance: {parseFloat(systemHealth.balance).toFixed(4)} MATIC
                </div>
              </div>
            )}
          </div>
          
          {error && (
            <div className="mt-4 bg-red-600 bg-opacity-80 text-white p-3 rounded-lg">
              <div className="flex items-center">
                <span className="text-xl mr-2">⚠️</span>
                <span>{error}</span>
                <button 
                  onClick={loadSystemData}
                  className="ml-auto bg-white bg-opacity-20 px-3 py-1 rounded text-sm hover:bg-opacity-30"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-md border-b">
        <div className="container mx-auto px-4">
          <div className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`${getNotificationColor(notification.type)} text-white p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 ease-in-out`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">{notification.message}</p>
                <p className="text-xs opacity-75 mt-1">
                  {notification.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="ml-2 text-white hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {!error && renderActiveComponent()}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm opacity-75">
            RWA Tokenization Platform - Powered by Polygon Blockchain
          </p>
          {contractInfo && (
            <div className="mt-2 text-xs opacity-60">
              <span>Token Supply: {parseFloat(contractInfo.rwaToken.totalSupply).toFixed(0)} RWAT</span>
              <span className="mx-2">•</span>
              <span>Discount Rate: {contractInfo.rwaToken.discountRate}%</span>
              <span className="mx-2">•</span>
              <span>Platform Revenue: ${parseFloat(contractInfo.pledgeManager.platformRevenue).toFixed(2)}</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;