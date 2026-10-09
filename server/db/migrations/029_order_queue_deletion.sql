-- Removing an unpaid order from the operations queue must not destroy the
-- checkout-to-order mapping: a hosted checkout can still report a late payment.
ALTER TABLE order_requests
  ADD COLUMN deleted_at DATETIME NULL AFTER updated_at,
  ADD COLUMN deleted_by_admin_id BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD INDEX idx_orders_queue (deleted_at, is_test, created_at),
  ADD CONSTRAINT fk_orders_deleted_by_admin FOREIGN KEY (deleted_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL;
