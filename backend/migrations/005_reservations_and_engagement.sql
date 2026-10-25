-- Reservations & capacity, reviews, events & catering, contact messages, newsletter.

CREATE TABLE seating_areas (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  covers_per_slot SMALLINT UNSIGNED NOT NULL COMMENT 'Guests that can be seated per time slot',
  min_party TINYINT UNSIGNED NOT NULL DEFAULT 1,
  max_party TINYINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_seating_areas_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservation_slots (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  start_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_reservation_slots_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE capacity_overrides (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_date DATE NOT NULL,
  start_time TIME NULL COMMENT 'NULL = whole day',
  seating_area_id TINYINT UNSIGNED NOT NULL,
  covers SMALLINT UNSIGNED NOT NULL COMMENT '0 closes the slot',
  reason VARCHAR(160) NULL,
  UNIQUE KEY uq_capacity_override (service_date, start_time, seating_area_id),
  CONSTRAINT fk_capacity_area FOREIGN KEY (seating_area_id) REFERENCES seating_areas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(12) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  guest_name VARCHAR(160) NOT NULL,
  guest_email VARCHAR(191) NOT NULL,
  guest_phone VARCHAR(20) NOT NULL,
  party_size TINYINT UNSIGNED NOT NULL,
  service_date DATE NOT NULL,
  start_time TIME NOT NULL,
  seating_area_id TINYINT UNSIGNED NOT NULL,
  occasion ENUM('none','birthday','anniversary','business','date_night','celebration','other') NOT NULL DEFAULT 'none',
  notes VARCHAR(500) NULL,
  status ENUM('pending','confirmed','seated','completed','cancelled','no_show') NOT NULL DEFAULT 'confirmed',
  table_label VARCHAR(20) NULL,
  deposit_kobo INT UNSIGNED NOT NULL DEFAULT 0,
  deposit_status ENUM('none','pending','paid','refunded','forfeited') NOT NULL DEFAULT 'none',
  cancelled_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reservations_code (code),
  KEY ix_reservations_slot (service_date, start_time, seating_area_id, status),
  KEY ix_reservations_user (user_id, service_date),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reservations_area FOREIGN KEY (seating_area_id) REFERENCES seating_areas (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  author_name VARCHAR(120) NOT NULL,
  dish_id INT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  title VARCHAR(120) NULL,
  body VARCHAR(1500) NOT NULL,
  status ENUM('pending','approved','hidden') NOT NULL DEFAULT 'pending',
  admin_reply VARCHAR(1000) NULL,
  replied_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_reviews_status (status, created_at),
  KEY ix_reviews_dish (dish_id, status),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_packages (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  price_per_guest_kobo INT UNSIGNED NOT NULL,
  min_guests SMALLINT UNSIGNED NOT NULL,
  max_guests SMALLINT UNSIGNED NOT NULL,
  features LONGTEXT NOT NULL COMMENT 'JSON array of strings',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_event_packages_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_enquiries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  company VARCHAR(160) NULL,
  event_type ENUM('private_dining','corporate','wedding','birthday','other') NOT NULL,
  package_id TINYINT UNSIGNED NULL,
  event_date DATE NOT NULL,
  guests SMALLINT UNSIGNED NOT NULL,
  budget_kobo BIGINT UNSIGNED NULL,
  message VARCHAR(2000) NULL,
  status ENUM('new','contacted','quoted','booked','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_event_enquiries_status (status, created_at),
  CONSTRAINT fk_event_enquiries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_event_enquiries_package FOREIGN KEY (package_id) REFERENCES event_packages (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(20) NULL,
  subject VARCHAR(160) NOT NULL,
  message VARCHAR(3000) NOT NULL,
  status ENUM('new','read','replied','archived') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_contact_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE newsletter_subscribers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  status ENUM('subscribed','unsubscribed') NOT NULL DEFAULT 'subscribed',
  source VARCHAR(40) NOT NULL DEFAULT 'footer',
  unsubscribe_token CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME NULL,
  UNIQUE KEY uq_newsletter_email (email),
  UNIQUE KEY uq_newsletter_token (unsubscribe_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
