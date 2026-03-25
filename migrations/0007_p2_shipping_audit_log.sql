-- Migration: Add p2_shipping_audit_log table for CMMC/DCAA compliant shipping data override history
CREATE TABLE IF NOT EXISTS p2_shipping_audit_log (
    id          SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    field_name  TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    changed_by  TEXT NOT NULL,
    changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    reason      TEXT NOT NULL
);
