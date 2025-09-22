import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API service object
const apiService = {
  // Health and system info
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  },

  async getContractInfo() {
    const response = await api.get('/contracts/info');
    return response.data;
  },

  // Pledge management
  async createPledge(pledgeData) {
    const response = await api.post('/pledge/create', pledgeData);
    return response.data;
  },

  async payClient(agreementId) {
    const response = await api.post('/pledge/pay-client', { agreementId });
    return response.data;
  },

  async getPledgeDetails(agreementId) {
    const response = await api.get(`/pledge/${agreementId}`);
    return response.data;
  },

  async getClientPledges(clientAddress) {
    const response = await api.get(`/client/${clientAddress}/pledges`);
    return response.data;
  },

  // Token operations
  async purchaseTokens(purchaseData) {
    const response = await api.post('/tokens/purchase', purchaseData);
    return response.data;
  },

  // Utility functions
  async getFreeUSDT(address) {
    const response = await api.post('/faucet/usdt', { address });
    return response.data;
  },

  // Error handling wrapper
  async handleApiCall(apiCall, errorMessage = 'API call failed') {
    try {
      return await apiCall();
    } catch (error) {
      const message = error.response?.data?.error || error.message || errorMessage;
      console.error('API Error:', message);
      throw new Error(message);
    }
  }
};

export default apiService;