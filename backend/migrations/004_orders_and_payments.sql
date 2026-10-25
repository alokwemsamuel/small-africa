-- Orders, items, status history, payments, webhooks, idempotency keys.

CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(160) NOT NULL,
  customer_email VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  fulfilment ENUM('delivery','pickup') NOT NULL,
  delivery_zone_id SMALLINT UNSIGNED NULL,
  address_snapshot LONGTEXT NULL COMMENT 'JSON copy of the address at order time',
  scheduled_for DATETIME NULL,
  status ENUM('pending_payment','received','preparing','ready','out_for_delivery','delivered','completed','cancelled') NOT NULL DEFAULT 'pending_payment',
  payment_status ENUM('unpaid','paid','failed','refunded','partially_refunded') NOT NULL DEFAULT 'unpaid',
  refund_flag TINYINT(1) NOT NULL DEFAULT 0,
  subtotal_kobo INT UNSIGNED NOT NULL,
  discount_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  delivery_fee_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  service_charge_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  vat_included_kobo INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'VAT portion already included in prices',
  wallet_applied_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  total_kobo INT UNSIGNED NOT NULL COMMENT 'Amount payable after wallet',
  coupon_id INT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  points_earned INT UNSIGNED NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(80) NULL,
  placed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_reference (reference),
  UNIQUE KEY uq_orders_idempotency (idempotency_key),
  KEY ix_orders_user (user_id, created_at),
  KEY ix_orders_status (status, created_at),
  KEY ix_orders_created (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones (id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  dish_id INT UNSIGNED NULL,
  dish_name VARCHAR(120) NOT NULL,
  kitchen_id TINYINT UNSIGNED NULL,
  unit_price_kobo INT UNSIGNED NOT NULL COMMENT 'Base price + selected options',
  quantity SMALLINT UNSIGNED NOT NULL,
  options LONGTEXT NULL COMMENT 'JSON snapshot of selected portion/add-ons',
  line_total_kobo INT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  KEY ix_order_items_order (order_id),
  KEY ix_order_items_dish (dish_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  note VARCHAR(255) NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_order_status_order (order_id, created_at),
  CONSTRAINT fk_order_status_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_status_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupon_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_kobo INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupon_redemptions_order (order_id),
  KEY ix_coupon_redemptions_user (coupon_id, user_id),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  purpose ENUM('order','wallet_topup','reservation_deposit','event_deposit') NOT NULL,
  payable_id BIGINT UNSIGNED NULL COMMENT 'orders.id / reservations.id / event_enquiries.id',
  provider ENUM('paystack','wallet','simulated') NOT NULL,
  reference VARCHAR(80) NOT NULL,
  amount_kobo INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status ENUM('initialized','success','failed','abandoned','reversed') NOT NULL DEFAULT 'initialized',
  provider_payload LONGTEXT NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_reference (reference),
  KEY ix_payments_payable (purpose, payable_id),
  KEY ix_payments_user (user_id, created_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  event_key VARCHAR(120) NOT NULL COMMENT 'event name + reference; dedupes retries',
  signature_valid TINYINT(1) NOT NULL,
  payload LONGTEXT NOT NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_events_key (provider, event_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idempotency_keys (
  idem_key VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  scope VARCHAR(40) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status_code SMALLINT UNSIGNED NULL,
  response LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_idempotency_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
