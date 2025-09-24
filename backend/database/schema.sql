-- RWA Tokenization Platform Database Schema
-- This schema syncs with smart contract events and provides additional business logic

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pledge Agreements Table
CREATE TABLE IF NOT EXISTS pledge_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id VARCHAR(255) UNIQUE NOT NULL,
    client_address VARCHAR(42) NOT NULL,
    asset_id VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100) NOT NULL,
    description TEXT,
    original_value BIGINT NOT NULL, -- Wei format (multiply by 1e18)
    discounted_value BIGINT NOT NULL,
    tokens_issued BIGINT NOT NULL,
    client_payment BIGINT NOT NULL, -- USDT amount in 6 decimals
    status INTEGER DEFAULT 1, -- 0=PENDING, 1=ACTIVE, 2=REPAID, 3=DEFAULTED, 4=RELEASED
    document_hash VARCHAR(255),
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Investor Purchases Table
CREATE TABLE IF NOT EXISTS investor_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id VARCHAR(255) UNIQUE NOT NULL,
    agreement_id VARCHAR(255) NOT NULL REFERENCES pledge_agreements(agreement_id),
    investor_address VARCHAR(42) NOT NULL,
    token_amount BIGINT NOT NULL,
    usdt_paid BIGINT NOT NULL, -- USDT amount in 6 decimals
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client Payments Table (tracks payments to clients)
CREATE TABLE IF NOT EXISTS client_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id VARCHAR(255) NOT NULL REFERENCES pledge_agreements(agreement_id),
    client_address VARCHAR(42) NOT NULL,
    amount BIGINT NOT NULL, -- USDT amount in 6 decimals
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transaction Log Table (all blockchain transactions)
CREATE TABLE IF NOT EXISTS transaction_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_hash VARCHAR(66) UNIQUE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- CREATE_PLEDGE, PAY_CLIENT, PURCHASE_TOKENS, etc.
    from_address VARCHAR(42),
    to_address VARCHAR(42),
    contract_address VARCHAR(42),
    method_name VARCHAR(100),
    parameters JSONB,
    gas_used BIGINT,
    gas_price BIGINT,
    block_number BIGINT,
    block_timestamp TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform Analytics Table
CREATE TABLE IF NOT EXISTS platform_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    total_pledges_created INTEGER DEFAULT 0,
    total_value_pledged BIGINT DEFAULT 0,
    total_tokens_purchased BIGINT DEFAULT 0,
    total_usdt_invested BIGINT DEFAULT 0,
    total_clients_paid BIGINT DEFAULT 0,
    platform_revenue BIGINT DEFAULT 0,
    active_pledges INTEGER DEFAULT 0,
    unique_investors INTEGER DEFAULT 0,
    unique_clients INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pledge_agreements_client ON pledge_agreements(client_address);
CREATE INDEX IF NOT EXISTS idx_pledge_agreements_status ON pledge_agreements(status);
CREATE INDEX IF NOT EXISTS idx_pledge_agreements_created ON pledge_agreements(created_at);

CREATE INDEX IF NOT EXISTS idx_investor_purchases_investor ON investor_purchases(investor_address);
CREATE INDEX IF NOT EXISTS idx_investor_purchases_agreement ON investor_purchases(agreement_id);
CREATE INDEX IF NOT EXISTS idx_investor_purchases_created ON investor_purchases(created_at);

CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_address);
CREATE INDEX IF NOT EXISTS idx_client_payments_agreement ON client_payments(agreement_id);

CREATE INDEX IF NOT EXISTS idx_transaction_log_hash ON transaction_log(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transaction_log_type ON transaction_log(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transaction_log_block ON transaction_log(block_number);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pledge_agreements_updated_at BEFORE UPDATE ON pledge_agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_analytics_updated_at BEFORE UPDATE ON platform_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE pledge_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_analytics ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all data
CREATE POLICY "Service role can access all data" ON pledge_agreements FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all data" ON investor_purchases FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all data" ON client_payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all data" ON transaction_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all data" ON platform_analytics FOR ALL USING (auth.role() = 'service_role');

-- Allow anonymous access for read operations (you can modify this based on your security needs)
CREATE POLICY "Anonymous can read pledge agreements" ON pledge_agreements FOR SELECT USING (true);
CREATE POLICY "Anonymous can read investor purchases" ON investor_purchases FOR SELECT USING (true);
CREATE POLICY "Anonymous can read platform analytics" ON platform_analytics FOR SELECT USING (true);