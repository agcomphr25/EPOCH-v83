
-- Add Alamo Rail Spacing option to rail_accessory feature
UPDATE features 
SET options = json('[
  {"value": "no_rail", "label": "No Rail", "price": 0},
  {"value": "4_arca_rail", "label": "4\" ARCA Rail", "price": 75},
  {"value": "6_arca_rail", "label": "6\" ARCA Rail", "price": 85},
  {"value": "8_arca_rail", "label": "8\" ARCA Rail", "price": 95},
  {"value": "pic", "label": "Pic", "price": 25},
  {"value": "pic_w_int_stud", "label": "Pic w/Int Stud", "price": 35},
  {"value": "alamo_rail_spacing", "label": "Alamo Rail Spacing", "price": 0}
]') 
WHERE id = 'rail_accessory';
