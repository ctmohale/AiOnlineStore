ALTER TABLE products
  ADD COLUMN deleted_at DATETIME NULL AFTER review_reason,
  ADD INDEX idx_products_deleted (deleted_at);
