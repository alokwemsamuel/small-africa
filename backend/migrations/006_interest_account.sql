-- Small Africa Interest Account: dining wallet, points, tiers, stamps, referrals, rewards, offers.
-- wallet_ledger and points_ledger are append-only (enforced by triggers). Cached balances in
-- loyalty_accounts are always written in the same transaction as the ledger row and can be
-- reconciled from the ledger at any time.

CREATE TABLE loyalty_accounts (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  tier ENUM('bronze','silver','gold','black_diamond') NOT NULL DEFAULT 'bronze',
  wallet_balance_kobo BIGINT NOT NULL DEFAULT 0,
  points_balance INT NOT NULL DEFAULT 0,
  stamps TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Current card, 0–9',
  lifetime_stamps INT UNSIGNED NOT NULL DEFAULT 0,
  streak_month CHAR(7) NULL COMMENT 'YYYY-MM of the current streak count',
  streak_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_activity_at DATETIME NULL,
  points_expiry_warned_at DATETIME NULL,
  winback_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_loyalty_tier (tier),
  KEY ix_loyalty_activity (last_activity_at),
  CONSTRAINT fk_loyalty_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wallet_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('topup','topup_bonus','interest','payment','refund','referral_bonus','reward_redemption','birthday','anniversary','adjustment') NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  amount_kobo BIGINT UNSIGNED NOT NULL,
  balance_after_kobo BIGINT NOT NULL,
  reference VARCHAR(80) NULL,
  description VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(120) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_ledger_idem (idempotency_key),
  KEY ix_wallet_ledger_user (user_id, id),
  KEY ix_wallet_ledger_type (entry_type, created_at),
  CONSTRAINT fk_wallet_ledger_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_wallet_ledger_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER trg_wallet_ledger_no_update BEFORE UPDATE ON wallet_ledger FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'wallet_ledger is append-only';

CREATE TRIGGER trg_wallet_ledger_no_delete BEFORE DELETE ON wallet_ledger FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'wallet_ledger is append-only';

CREATE TABLE points_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('earn','bonus','streak','birthday','referral','redeem','expire','adjustment') NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  points INT UNSIGNED NOT NULL,
  balance_after INT NOT NULL,
  reference VARCHAR(80) NULL,
  description VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(120) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_points_ledger_idem (idempotency_key),
  KEY ix_points_ledger_user (user_id, id),
  KEY ix_points_ledger_type (entry_type, created_at),
  CONSTRAINT fk_points_ledger_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_points_ledger_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER trg_points_ledger_no_update BEFORE UPDATE ON points_ledger FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'points_ledger is append-only';

CREATE TRIGGER trg_points_ledger_no_delete BEFORE DELETE ON points_ledger FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'points_ledger is append-only';

CREATE TABLE interest_runs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period CHAR(7) NOT NULL COMMENT 'YYYY-MM the interest is for',
  status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  accounts_credited INT UNSIGNED NOT NULL DEFAULT 0,
  total_kobo BIGINT UNSIGNED NOT NULL DEFAULT 0,
  triggered_by ENUM('cron','admin','demo') NOT NULL DEFAULT 'cron',
  run_by_user_id BIGINT UNSIGNED NULL,
  error VARCHAR(500) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  UNIQUE KEY uq_interest_runs_period (period),
  CONSTRAINT fk_interest_runs_user FOREIGN KEY (run_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE referrals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id BIGINT UNSIGNED NOT NULL,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','rewarded','rejected') NOT NULL DEFAULT 'pending',
  reject_reason VARCHAR(160) NULL,
  signup_ip VARCHAR(45) NULL,
  device_hash CHAR(64) NULL,
  qualifying_order_id BIGINT UNSIGNED NULL,
  rewarded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referrals_referred (referred_user_id),
  KEY ix_referrals_referrer (referrer_user_id, status),
  KEY ix_referrals_device (device_hash),
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_order FOREIGN KEY (qualifying_order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rewards_catalog (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  points_cost INT UNSIGNED NOT NULL,
  reward_type ENUM('credit','item','upgrade') NOT NULL,
  credit_kobo INT UNSIGNED NULL,
  dish_id INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_rewards_slug (slug),
  CONSTRAINT fk_rewards_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reward_vouchers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  source ENUM('points','stamp_card','birthday','anniversary','winback','admin') NOT NULL,
  reward_id SMALLINT UNSIGNED NULL,
  title VARCHAR(120) NOT NULL,
  code VARCHAR(16) NOT NULL,
  points_spent INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('issued','used','expired','cancelled') NOT NULL DEFAULT 'issued',
  used_order_id BIGINT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reward_vouchers_code (code),
  KEY ix_reward_vouchers_user (user_id, status),
  CONSTRAINT fk_vouchers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_vouchers_reward FOREIGN KEY (reward_id) REFERENCES rewards_catalog (id) ON DELETE SET NULL,
  CONSTRAINT fk_vouchers_order FOREIGN KEY (used_order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('winback','kitchen_affinity','birthday','anniversary','tier_upgrade') NOT NULL,
  coupon_id INT UNSIGNED NULL,
  headline VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  whatsapp_text VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_offers_user (user_id, kind, created_at),
  CONSTRAINT fk_offers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_offers_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
