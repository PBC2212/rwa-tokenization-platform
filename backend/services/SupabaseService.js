const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase Service for RWA Tokenization Platform
 * Handles database operations and data synchronization
 */
class SupabaseService {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  /**
   * Initialize Supabase client
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Supabase client...');

      // Check required environment variables
      if (!process.env.SUPABASE_URL) {
        throw new Error('SUPABASE_URL not found in environment variables');
      }

      if (!process.env.SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY not found in environment variables');
      }

      // Initialize Supabase client
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false // Server-side, no session persistence needed
          }
        }
      );

      // Test connection
      await this.testConnection();

      this.initialized = true;
      console.log('✅ Supabase client initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Supabase client:', error.message);
      throw error;
    }
  }

  /**
   * Test Supabase connection
   */
  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from('pledge_agreements')
        .select('count', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') { // PGRST116 = relation does not exist (table not created yet)
        throw error;
      }

      console.log('✅ Supabase connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Supabase connection test failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get Supabase client instance
   */
  getClient() {
    if (!this.initialized) {
      throw new Error('Supabase service not initialized');
    }
    return this.supabase;
  }
}

module.exports = SupabaseService;