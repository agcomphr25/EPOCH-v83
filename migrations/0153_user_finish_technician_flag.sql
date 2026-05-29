ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_finish_technician boolean DEFAULT false;

UPDATE users
SET is_finish_technician = false
WHERE is_finish_technician IS NULL;

UPDATE users
SET is_finish_technician = true,
    updated_at = NOW()
WHERE LOWER(username) = 'hunta'
   OR (LOWER(COALESCE(first_name, '')) = 'adam'
       AND LOWER(COALESCE(last_name, '')) = 'hunt');
