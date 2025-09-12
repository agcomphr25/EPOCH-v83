-- Vendor Management Tables Migration
-- Creates all vendor-related tables with proper constraints and foreign keys

-- Main vendors table (should already exist but create if not)
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(500),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',
  approval_status VARCHAR(50) DEFAULT 'pending',
  total_score DECIMAL(5,2) DEFAULT 0,
  last_scored_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vendor contacts table with slot-based constraints
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  contact_slot INTEGER NOT NULL CHECK (contact_slot BETWEEN 1 AND 3),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vendor_id, contact_slot)
);

-- Vendor addresses table with slot-based constraints
CREATE TABLE IF NOT EXISTS vendor_addresses (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  address_slot INTEGER NOT NULL CHECK (address_slot BETWEEN 1 AND 2),
  type VARCHAR(20) DEFAULT 'business' CHECK (type IN ('business', 'billing')),
  street_1 VARCHAR(255) NOT NULL,
  street_2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) DEFAULT 'USA',
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vendor_id, address_slot)
);

-- Vendor contact phones with slot-based constraints
CREATE TABLE IF NOT EXISTS vendor_contact_phones (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES vendor_contacts(id) ON DELETE CASCADE,
  phone_slot INTEGER NOT NULL CHECK (phone_slot BETWEEN 1 AND 2),
  type VARCHAR(20) DEFAULT 'work' CHECK (type IN ('work', 'mobile', 'fax')),
  phone_number VARCHAR(20) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, phone_slot)
);

-- Vendor contact emails with slot-based constraints
CREATE TABLE IF NOT EXISTS vendor_contact_emails (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES vendor_contacts(id) ON DELETE CASCADE,
  email_slot INTEGER NOT NULL CHECK (email_slot BETWEEN 1 AND 2),
  type VARCHAR(20) DEFAULT 'work' CHECK (type IN ('work', 'personal')),
  email_address VARCHAR(255) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, email_slot)
);

-- Vendor documents table
CREATE TABLE IF NOT EXISTS vendor_documents (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(100),
  file_path VARCHAR(500),
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by VARCHAR(100),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vendor scoring criteria table
CREATE TABLE IF NOT EXISTS vendor_scoring_criteria (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  weight DECIMAL(5,2) DEFAULT 1.0,
  max_score INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vendor scores table
CREATE TABLE IF NOT EXISTS vendor_scores (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  criteria_id INTEGER NOT NULL REFERENCES vendor_scoring_criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  notes TEXT,
  scored_by VARCHAR(100),
  scored_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor_id ON vendor_contacts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_addresses_vendor_id ON vendor_addresses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contact_phones_contact_id ON vendor_contact_phones(contact_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contact_emails_contact_id ON vendor_contact_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_vendor_id ON vendor_scores(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_criteria_id ON vendor_scores(criteria_id);