-- Advisory duplicate-stock review workflow. This intentionally does not block
-- production during the initial shadow/calibration period.

CREATE TABLE IF NOT EXISTS potential_order_duplicate_reviews (
  id serial PRIMARY KEY,
  new_order_id text NOT NULL,
  candidate_order_id text NOT NULL,
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('MEDIUM', 'HIGH')),
  matched_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  configuration_differences jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED')),
  resolution_code text,
  resolution_note text,
  reviewed_by_user_id integer,
  reviewed_by_display_name text,
  reviewed_at timestamp,
  detected_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT potential_order_duplicate_reviews_pair_unique
    UNIQUE (new_order_id, candidate_order_id)
);

CREATE INDEX IF NOT EXISTS potential_order_duplicate_reviews_new_order_idx
  ON potential_order_duplicate_reviews (new_order_id);
CREATE INDEX IF NOT EXISTS potential_order_duplicate_reviews_candidate_order_idx
  ON potential_order_duplicate_reviews (candidate_order_id);
CREATE INDEX IF NOT EXISTS potential_order_duplicate_reviews_status_risk_idx
  ON potential_order_duplicate_reviews (status, risk_level);

CREATE INDEX IF NOT EXISTS all_orders_customer_order_date_idx
  ON all_orders (customer_id, order_date DESC);
CREATE INDEX IF NOT EXISTS all_orders_model_order_date_idx
  ON all_orders (model_id, order_date DESC);
CREATE INDEX IF NOT EXISTS customer_addresses_customer_identity_idx
  ON customer_addresses (customer_id, zip_code);

COMMENT ON TABLE potential_order_duplicate_reviews IS
  'Human validation trail for advisory potential duplicate customer stock demand.';
