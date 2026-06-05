CREATE TABLE IF NOT EXISTS p2_billing_task_snoozes (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  snoozed_until TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, username)
);

