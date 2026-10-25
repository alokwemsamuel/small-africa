-- Payment attempts: Paystack refuses a reference that was used before, so every retry after a
-- declined card is a new payments row ("SA-ABC123-2") linked to the same order or top-up.
-- An abandoned attempt keeps its access code so the guest can resume the same transaction.
ALTER TABLE payments
  ADD COLUMN attempt TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER reference,
  ADD COLUMN access_code VARCHAR(120) NULL AFTER attempt,
  ADD COLUMN authorization_url VARCHAR(255) NULL AFTER access_code;

-- Wallet top-ups (Interest Account). Credited only after server-side verification.
CREATE TABLE wallet_topups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  amount_kobo INT UNSIGNED NOT NULL,
  bonus_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(80) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_topups_reference (reference),
  UNIQUE KEY uq_wallet_topups_idem (user_id, idempotency_key),
  KEY ix_wallet_topups_user (user_id, created_at),
  CONSTRAINT fk_wallet_topups_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vouchers say what they can be swapped for at checkout: one dish, or one item from a category.
ALTER TABLE reward_vouchers
  ADD COLUMN dish_id INT UNSIGNED NULL AFTER reward_id,
  ADD COLUMN category_slug VARCHAR(30) NULL AFTER dish_id,
  ADD COLUMN dine_in_only TINYINT(1) NOT NULL DEFAULT 0 AFTER category_slug,
  ADD CONSTRAINT fk_vouchers_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE SET NULL;

ALTER TABLE rewards_catalog
  ADD COLUMN category_slug VARCHAR(30) NULL AFTER dish_id,
  ADD COLUMN dine_in_only TINYINT(1) NOT NULL DEFAULT 0 AFTER category_slug;

ALTER TABLE orders
  ADD COLUMN voucher_id BIGINT UNSIGNED NULL AFTER coupon_id,
  ADD COLUMN voucher_discount_kobo INT UNSIGNED NOT NULL DEFAULT 0 AFTER discount_kobo,
  ADD COLUMN loyalty_processed_at DATETIME NULL AFTER points_earned,
  ADD CONSTRAINT fk_orders_voucher FOREIGN KEY (voucher_id) REFERENCES reward_vouchers (id) ON DELETE SET NULL;

-- 12-month spend that decides the tier, cached alongside the balances.
ALTER TABLE loyalty_accounts
  ADD COLUMN spend_12m_kobo BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER tier,
  ADD COLUMN tier_updated_at DATETIME NULL AFTER spend_12m_kobo,
  ADD COLUMN birthday_rewarded_year SMALLINT UNSIGNED NULL AFTER winback_sent_at,
  ADD COLUMN anniversary_rewarded_year SMALLINT UNSIGNED NULL AFTER birthday_rewarded_year,
  ADD COLUMN affinity_offer_month CHAR(7) NULL AFTER anniversary_rewarded_year;

ALTER TABLE referrals ADD COLUMN referred_phone VARCHAR(30) NULL AFTER device_hash;

ALTER TABLE customer_offers ADD COLUMN read_at DATETIME NULL AFTER sent_at;
