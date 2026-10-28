-- Welcome bonus: bonus points after a new customer's first completed order, once per customer.
-- The amount is the loyalty setting `welcome_bonus_points` (0 switches it off). This is where the
-- state of each customer's bonus is kept: NULL means "never applied" (customers who already had
-- completed orders before this existed stay NULL and are not paid), `pending` means it is waiting
-- for the email to be verified, then it ends as `awarded` or `rejected` (with the reason).
-- Compatible with MySQL 8 and MariaDB 10.4+.

ALTER TABLE loyalty_accounts
  ADD COLUMN welcome_bonus_status ENUM('pending','awarded','rejected') NULL,
  ADD COLUMN welcome_bonus_reason VARCHAR(120) NULL,
  ADD COLUMN welcome_bonus_at DATETIME NULL;

-- Existing databases: put the new setting (200 points) next to the others so the admin panel shows it.
UPDATE settings
   SET setting_value = JSON_SET(setting_value, '$.welcome_bonus_points', 200)
 WHERE setting_key = 'loyalty' AND JSON_EXTRACT(setting_value, '$.welcome_bonus_points') IS NULL;
