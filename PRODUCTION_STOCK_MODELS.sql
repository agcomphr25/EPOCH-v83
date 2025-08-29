-- PRODUCTION STOCK MODELS RESTORE
-- Execute this SQL script in your production database to restore all 47 stock models from EPOCH v8
-- Generated on 2025-08-29

-- Insert all 47 stock models from original EPOCH v8 database
INSERT INTO stock_models (id, name, display_name, price, description, is_active, sort_order, created_at, updated_at, handedness) VALUES 
('cf_sportsman', 'cf_sportsman', 'CF Sportsman', 689, '', true, 2, '2025-07-12T19:05:51.041Z', '2025-07-12T19:05:51.041Z', NULL),
('cf_visigoth_tikka', 'cf_visigoth_tikka', 'CF Visigoth-Tikka', 719, '', true, 33, '2025-07-14T17:59:35.278Z', '2025-07-14T17:59:35.278Z', NULL),
('cf_chalk_branch', 'cf_chalk_branch', 'CF Chalk Branch', 719, '', true, 5, '2025-07-12T19:05:51.041Z', '2025-07-12T19:05:51.041Z', NULL),
('cf_alpine_hunter', 'cf_alpine_hunter', 'CF Alpine Hunter', 719, '', true, 6, '2025-07-12T19:05:51.041Z', '2025-07-12T19:06:48.229Z', NULL),
('fg_adj_alp_hunter_tikka', 'fg_adj_alp_hunter_tikka', 'FG Adj Alpine Hunter-Tikka', 579, '', true, 36, '2025-07-14T18:01:34.795Z', '2025-07-14T18:01:34.795Z', NULL),
('cf_visigoth', 'cf_visigoth', 'CF Visigoth', 719, '', true, 4, '2025-07-14T02:11:47.326Z', '2025-07-14T02:11:47.326Z', NULL),
('cf_armor', 'cf_armor', 'CF Armor', 719, '', true, 8, '2025-07-12T19:05:51.041Z', '2025-07-12T19:05:51.041Z', NULL),
('cf_ferrata', 'cf_ferrata', 'CF Ferrata', 899, '', true, 9, '2025-07-14T02:10:55.212Z', '2025-07-14T02:10:55.212Z', NULL),
('cf_k2', 'cf_k2', 'CF K2', 719, '', true, 7, '2025-07-14T02:12:20.062Z', '2025-07-14T02:12:20.062Z', NULL),
('privateer-tikka', 'privateer-tikka', 'CF Privateer-Tikka', 689, '', true, 30, '2025-07-14T17:48:44.650Z', '2025-07-14T17:48:44.650Z', NULL),
('privateer-tikka_fg', 'privateer-tikka_fg', 'FG Privateer-Tikka', 399, '', true, 32, '2025-07-14T17:55:39.326Z', '2025-07-14T17:55:39.326Z', NULL),
('cf_adj_armor', 'cf_adj_armor', 'CF Adj Armor', 849, '', true, 10, '2025-07-14T02:15:35.952Z', '2025-07-14T02:15:35.952Z', NULL),
('cf_adj_chalk_branch', 'cf_adj_chalk_branch', 'CF Adj Chalk Branch', 849, '', true, 11, '2025-07-14T02:16:04.432Z', '2025-07-14T02:16:04.432Z', NULL),
('cf_adj_alp_hunter', 'cf_adj_alp_hunter', 'CF Adj Alpine Hunter', 849, '', true, 12, '2025-07-14T02:16:36.938Z', '2025-07-14T02:16:36.938Z', NULL),
('cf_adj_k2', 'cf_adj_k2', 'CF Adj K2', 849, '', true, 13, '2025-07-14T02:17:32.047Z', '2025-07-14T02:17:32.047Z', NULL),
('fg_privateer', 'fg_privateer', 'FG Privateer', 399, '', true, 14, '2025-07-14T02:26:37.348Z', '2025-07-14T02:26:37.348Z', NULL),
('fg_armor', 'fg_armor', 'FG Armor', 449, '', true, 21, '2025-07-14T02:29:57.254Z', '2025-07-14T02:29:57.254Z', NULL),
('fg_ferrata', 'fg_ferrata', 'FG Ferrata', 679, '', true, 22, '2025-07-14T02:30:23.318Z', '2025-07-14T02:30:23.318Z', NULL),
('fg_k2', 'fg_k2', 'FG K2', 449, '', true, 20, '2025-07-14T02:28:36.797Z', '2025-07-14T02:28:36.797Z', NULL),
('fg_alpine_hunter', 'fg_alpine_hunter', 'FG Alpine Hunter', 449, '', true, 19, '2025-07-14T02:29:07.605Z', '2025-07-14T02:29:07.605Z', NULL),
('fg_chalk_branch', 'fg_chalk_branch', 'FG Chalk Branch', 449, '', true, 18, '2025-07-14T02:28:01.317Z', '2025-07-14T02:28:01.317Z', NULL),
('fg_visigoth', 'fg_visigoth', 'FG Visigoth', 449, '', true, 17, '2025-07-14T02:27:42.729Z', '2025-07-14T02:27:42.729Z', NULL),
('fg_adj_armor', 'fg_adj_armor', 'FG Adj Armor', 579, '', true, 23, '2025-07-14T02:34:02.573Z', '2025-07-14T02:34:02.573Z', NULL),
('fg_adj_k2', 'fg_adj_k2', 'FG Adj K2', 579, '', true, 26, '2025-07-14T02:33:26.918Z', '2025-07-14T02:33:26.918Z', NULL),
('fg_adj_chalk_branch', 'fg_adj_chalk_branch', 'FG Adj Chalk Branck', 579, '', true, 24, '2025-07-14T02:34:47.295Z', '2025-07-14T02:34:47.295Z', NULL),
('fg_adj_alp_hunter', 'fg_adj_alp_hunter', 'FG Adj Alpine Hunter', 579, '', true, 25, '2025-07-14T02:35:32.297Z', '2025-07-14T02:35:32.297Z', NULL),
('m1a_fiberglass', 'm1a_fiberglass', 'FG M1A ', 599, '', true, 28, '2025-07-14T17:35:39.309Z', '2025-07-14T17:35:39.309Z', NULL),
('m1a_carbon', 'm1a_carbon', 'CF M1A', 799, '', true, 27, '2025-07-14T17:34:22.833Z', '2025-07-14T17:34:22.833Z', NULL),
('alpine_hunter_tikka_fg', 'alpine_hunter_tikka_fg', 'FG Alpine Hunter-Tikka', 599, '', true, 31, '2025-07-14T17:53:03.174Z', '2025-07-14T17:53:03.174Z', NULL),
('mesa_universal', 'mesa_universal', 'Mesa Universal', 0, 'Mesa Universal stock model', true, 0, '2025-07-23T15:38:55.840Z', '2025-07-23T15:38:55.840Z', NULL),
('mesa_tikka', 'mesa_tikka', 'Mesa Tikka', 0, 'Mesa Tikka stock model', true, 0, '2025-07-23T15:38:55.840Z', '2025-07-23T15:38:55.840Z', NULL),
('alpine_hunter_tikka', 'alpine_hunter_tikka', 'CF Alpine Hunter-Tikka', 719, '', true, 29, '2025-07-14T17:48:11.383Z', '2025-07-14T17:48:11.383Z', NULL),
('cf_privateer', 'cf_privateer', 'CF Privateer', 689, '', true, 1, '2025-08-07T14:05:52.847Z', '2025-08-07T14:05:52.847Z', NULL),
('mesa_adjustable', 'mesa_adjustable', 'Mesa Adjustable', 0, 'Mesa Adjustable stock model', true, 0, '2025-07-23T15:38:55.840Z', '2025-07-23T15:38:55.840Z', NULL),
('fg_sportsman', 'fg', 'FG Sportsman', 399, '', true, 15, '2025-07-14T02:27:08.120Z', '2025-07-14T02:27:08.120Z', NULL),
('fg_visigoth_tikka', 'fg_visigoth_tikka', 'FG Visigoth-Tikka Updated', 450, '', true, 34, '2025-07-14T17:59:59.654Z', '2025-07-14T17:59:59.654Z', NULL),
('no_stock', 'no_stock', 'None', 0, '', true, 0, '2025-08-13T18:31:06.659Z', '2025-08-13T18:31:06.659Z', NULL),
('apr_hunter_lh', 'apr_hunter_lh', 'APR Hunter (LH)', 394, 'APR Hunter Left-handed', true, 37, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'LH'),
('apr_hunter_rh', 'apr_hunter_rh', 'APR Hunter (RH)', 394, 'APR Hunter Right-handed', true, 38, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'RH'),
('cf_cat_lh', 'cf_cat_lh', 'CF CAT (LH)', 689, 'CF CAT Left-handed', true, 3, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'LH'),
('cf_cat_rh', 'cf_cat_rh', 'CF CAT (RH)', 689, 'CF CAT Right-handed', true, 4, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'RH'),
('fg_cat_lh', 'fg_cat_lh', 'FG CAT (LH)', 399, 'FG CAT Left-handed', true, 16, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'LH'),
('fg_cat_rh', 'fg_cat_rh', 'FG CAT (RH)', 399, 'FG CAT Right-handed', true, 17, '2025-08-15T13:01:47.521Z', '2025-08-15T13:01:47.521Z', 'RH'),
('cf_cat', 'cf_cat', 'CF CAT', 689, '', false, 3, '2025-07-14T02:10:27.654Z', '2025-07-14T02:10:27.654Z', NULL),
('apr_hunter', 'apr_hunter', 'APR Hunter', 394, '', false, 37, '2025-07-16T15:36:26.307Z', '2025-07-16T15:36:26.307Z', NULL),
('fg_cat', 'fg_cat', 'FG CAT', 399, '', false, 16, '2025-07-14T02:27:23.776Z', '2025-07-14T02:27:23.776Z', NULL),
('cf_adj_alp_hunter_tikka', 'cf_adj_alp_hunter_tikka', 'CF Adj Alpine Hunter-Tikka', 849, '', true, 35, '2025-07-14T18:01:04.246Z', '2025-07-14T18:01:04.246Z', NULL);

-- Verify the insert
SELECT COUNT(*) as total_stock_models FROM stock_models;

-- Optional: Show all stock models ordered by sort_order
-- SELECT id, display_name, price, handedness, is_active FROM stock_models WHERE is_active = true ORDER BY sort_order;