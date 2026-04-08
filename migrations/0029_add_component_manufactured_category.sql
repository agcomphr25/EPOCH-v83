-- Migration: Add COMPONENT to inventory_manufactured_category enum
ALTER TYPE inventory_manufactured_category ADD VALUE IF NOT EXISTS 'COMPONENT';
