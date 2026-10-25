-- Phase 4: status timestamps and lookups. Tracking/manage links are stateless HMAC tokens
-- (see Crypto::mac), so nothing about them is stored.

ALTER TABLE orders
  ADD COLUMN status_updated_at DATETIME NULL AFTER placed_at,
  ADD COLUMN cancelled_reason VARCHAR(255) NULL AFTER status_updated_at,
  ADD KEY ix_orders_email (customer_email);

ALTER TABLE reservations
  ADD KEY ix_reservations_email (guest_email);

-- One review per dish per order.
ALTER TABLE reviews
  ADD UNIQUE KEY uq_reviews_order_dish (order_id, dish_id);
