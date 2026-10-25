-- Appearance preference that follows the user across devices, and a pork flag for dishes
-- (many Lagos guests don't eat pork; the menu offers a "No pork" filter).

ALTER TABLE users
  ADD COLUMN theme_preference ENUM('dark','light','system') NULL AFTER marketing_opt_in;

ALTER TABLE dishes
  ADD COLUMN contains_pork TINYINT(1) NOT NULL DEFAULT 0 AFTER contains_nuts,
  ADD KEY ix_dishes_pork (contains_pork);
