-- Dine-in bills recorded by the front desk for Interest Account members: they earn points and
-- a stamp, and count towards the member's 12-month tier spend just like online orders.
CREATE TABLE dine_in_visits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  amount_kobo INT UNSIGNED NOT NULL COMMENT 'Food and drink on the bill, excluding service charge',
  reservation_id BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  points_earned INT UNSIGNED NOT NULL DEFAULT 0,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  visited_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dine_in_reference (reference),
  KEY ix_dine_in_user (user_id, visited_at),
  CONSTRAINT fk_dine_in_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dine_in_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL,
  CONSTRAINT fk_dine_in_recorder FOREIGN KEY (recorded_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
