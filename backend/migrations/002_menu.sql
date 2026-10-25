-- Kitchens, categories, dishes, options/add-ons, tasting menu courses.

CREATE TABLE kitchens (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  tagline VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  accent_color CHAR(7) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_kitchens_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD CONSTRAINT fk_users_favourite_kitchen FOREIGN KEY (favourite_kitchen_id) REFERENCES kitchens (id) ON DELETE SET NULL;

CREATE TABLE categories (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dishes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kitchen_id TINYINT UNSIGNED NULL COMMENT 'NULL = spans all three kitchens (e.g. tasting menu)',
  category_id SMALLINT UNSIGNED NOT NULL,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(120) NOT NULL,
  short_description VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  ingredients TEXT NULL,
  allergens VARCHAR(255) NULL COMMENT 'Comma-separated: gluten,dairy,egg,nuts,peanuts,fish,shellfish,soy,sesame,celery,mustard,sulphites',
  price_kobo INT UNSIGNED NOT NULL,
  spice_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_vegetarian TINYINT(1) NOT NULL DEFAULT 0,
  is_gluten_free TINYINT(1) NOT NULL DEFAULT 0,
  contains_nuts TINYINT(1) NOT NULL DEFAULT 0,
  is_alcoholic TINYINT(1) NOT NULL DEFAULT 0,
  image_path VARCHAR(255) NULL,
  image_alt VARCHAR(255) NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  sold_out_until DATE NULL COMMENT '"Sold out today" sets this to today',
  popularity INT UNSIGNED NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_dishes_slug (slug),
  KEY ix_dishes_browse (kitchen_id, category_id, is_available),
  KEY ix_dishes_featured (is_featured),
  KEY ix_dishes_popularity (popularity),
  CONSTRAINT fk_dishes_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dishes_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dish_options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dish_id INT UNSIGNED NOT NULL,
  option_group ENUM('portion','addon') NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_delta_kobo INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  KEY ix_dish_options_dish (dish_id, option_group),
  CONSTRAINT fk_dish_options_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tasting_courses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dish_id INT UNSIGNED NOT NULL,
  course_no TINYINT UNSIGNED NOT NULL,
  kitchen_id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_tasting_course (dish_id, course_no),
  CONSTRAINT fk_tasting_dish FOREIGN KEY (dish_id) REFERENCES dishes (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasting_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
