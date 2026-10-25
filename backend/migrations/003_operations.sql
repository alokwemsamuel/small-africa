-- Settings, opening hours, delivery zones, addresses, coupons.

CREATE TABLE settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NOT NULL COMMENT 'JSON-encoded value',
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE opening_hours (
  day_of_week TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT '0 = Sunday … 6 = Saturday',
  opens_at TIME NULL,
  closes_at TIME NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE delivery_zones (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  fee_kobo INT UNSIGNED NOT NULL,
  min_order_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  eta_minutes SMALLINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_delivery_zones_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(40) NOT NULL,
  line1 VARCHAR(160) NOT NULL,
  line2 VARCHAR(160) NULL,
  landmark VARCHAR(160) NULL,
  delivery_zone_id SMALLINT UNSIGNED NULL,
  city VARCHAR(60) NOT NULL DEFAULT 'Lagos',
  phone VARCHAR(20) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_addresses_user (user_id),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_addresses_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  description VARCHAR(255) NOT NULL,
  discount_type ENUM('percent','fixed') NOT NULL,
  discount_value INT UNSIGNED NOT NULL COMMENT 'Percent (1–100) or kobo',
  min_order_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  max_discount_kobo INT UNSIGNED NULL,
  kitchen_id TINYINT UNSIGNED NULL COMMENT 'Restrict discount to one kitchen''s items',
  valid_weekdays VARCHAR(20) NULL COMMENT 'Comma list of 0–6; NULL = every day',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  usage_limit INT UNSIGNED NULL,
  per_user_limit INT UNSIGNED NULL,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0,
  times_used INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupons_code (code),
  CONSTRAINT fk_coupons_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
