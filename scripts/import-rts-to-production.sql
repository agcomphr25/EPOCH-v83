-- RTS Inventory Import Script for Production Database
-- Generated from Excel file: Ready to Ship Stocks (version 1)
-- Date: 2025-11-03
-- 
-- Instructions:
-- 1. Open the Replit Database pane
-- 2. Switch to Production database
-- 3. Copy and paste this SQL script
-- 4. Execute to import 23 RTS inventory items

INSERT INTO rts_inventory (stock_model, action_length, action, barrel, bottom_metal, color, extras, status)
VALUES
  ('CF Alpine Hunter', 'Short', 'Lone Peak', 'Rem Factory Sporter', 'Hawkins M5', 'Carbon Camo Ready', 'EH133', 'AVAILABLE'),
  ('CF Alpine Hunter', 'Long', 'Rem 700', 'Bartlein 3b', 'Rem BDL', 'C. Black', 'AI219', 'AVAILABLE'),
  ('CF Adj. Chalk Branch', 'Short', 'Bergara Premier', 'SWS Bull', 'AG M5', 'C Desert Night', 'AG049', 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('CF Alpine Hunter', 'Short', 'Lone Peak', 'Rem Factory Sporter', 'Hawkins M5', 'Carbon Camo Ready', 'EH133', 'AVAILABLE'),
  ('CF Adj. Chalk Branch', 'Short', 'Bergara Premier', 'SWS Bull', 'AG M5', 'C Desert Night', 'AG049', 'AVAILABLE'),
  ('CF Alpine Hunter', 'Long', 'Rem 700', 'Bartlein 3b', 'Rem BDL', 'C. Black', 'AI219', 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('CF Alpine Hunter', 'Short', 'Lone Peak', 'Rem Factory Sporter', 'Hawkins M5', 'Carbon Camo Ready', 'EH133', 'AVAILABLE'),
  ('CF Adj. Chalk Branch', 'Short', 'Bergara Premier', 'SWS Bull', 'AG M5', 'C Desert Night', 'AG049', 'AVAILABLE'),
  ('CF Alpine Hunter', 'Long', 'Rem 700', 'Bartlein 3b', 'Rem BDL', 'C. Black', 'AI219', 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('CF Alpine Hunter', 'Short', 'Lone Peak', 'Rem Factory Sporter', 'Hawkins M5', 'Carbon Camo Ready', 'EH133', 'AVAILABLE'),
  ('CF Adj. Chalk Branch', 'Short', 'Bergara Premier', 'SWS Bull', 'AG M5', 'C Desert Night', 'AG049', 'AVAILABLE'),
  ('CF Alpine Hunter', 'Long', 'Rem 700', 'Bartlein 3b', 'Rem BDL', 'C. Black', 'AI219', 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('FG Privateer LH', 'Long', 'Rem 700', 'Rem Factory Sporter', 'AG M5', 'Black Camo', NULL, 'AVAILABLE'),
  ('CF Alpine Hunter', 'Short', 'Lone Peak', 'Rem Factory Sporter', 'Hawkins M5', 'Carbon Camo Ready', 'EH133', 'AVAILABLE'),
  ('CF Adj. Chalk Branch', 'Short', 'Bergara Premier', 'SWS Bull', 'AG M5', 'C Desert Night', 'AG049', 'AVAILABLE'),
  ('CF Alpine Hunter', 'Long', 'Rem 700', 'Bartlein 3b', 'Rem BDL', 'C. Black', 'AI219', 'AVAILABLE');

-- Verify import
SELECT COUNT(*) as imported_count FROM rts_inventory WHERE status = 'AVAILABLE';
