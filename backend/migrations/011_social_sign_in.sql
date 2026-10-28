-- Sign in with Google, Apple and Facebook.
-- Customers who only use a provider have no password; they finish a short "welcome" step after
-- their first sign-up (phone, optional birthday, terms). Compatible with MySQL 8 and MariaDB 10.4+.

ALTER TABLE users
  MODIFY password_hash VARCHAR(255) NULL COMMENT 'NULL for customers who sign in only with a provider',
  ADD COLUMN signup_provider ENUM('google','apple','facebook') NULL COMMENT 'How the account was created, if with a provider' AFTER staff_position,
  ADD COLUMN onboarded_at DATETIME NULL COMMENT 'When the welcome step after a social sign-up was finished',
  ADD COLUMN terms_accepted_at DATETIME NULL COMMENT 'When the customer accepted the Terms, Privacy Policy and Rewards Terms (welcome step)';

-- One row per provider account connected to a customer. The provider's own user id ("sub") is
-- what identifies the person, never the email address.
CREATE TABLE user_identities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('google','apple','facebook') NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  email VARCHAR(191) NULL COMMENT 'The email the provider gave at the last sign-in (may be a relay address)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  UNIQUE KEY uq_identity_provider_subject (provider, provider_user_id),
  UNIQUE KEY uq_identity_user_provider (user_id, provider),
  KEY ix_identity_user (user_id),
  CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
