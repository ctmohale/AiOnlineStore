-- Require an auditable supplier check for every order line before a quote can be confirmed.
ALTER TABLE order_items
  ADD COLUMN supplier_verification_status ENUM('pending','verified','unavailable') NOT NULL DEFAULT 'pending' AFTER estimated_supplier_days_max,
  ADD COLUMN verified_supplier_unit_cost DECIMAL(12,2) NULL AFTER supplier_verification_status,
  ADD COLUMN supplier_stock_verified_at DATETIME NULL AFTER verified_supplier_unit_cost,
  ADD COLUMN supplier_verification_notes VARCHAR(500) NULL AFTER supplier_stock_verified_at,
  ADD COLUMN supplier_verified_by_admin_id BIGINT UNSIGNED NULL AFTER supplier_verification_notes,
  ADD FOREIGN KEY (supplier_verified_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  ADD INDEX idx_order_item_verification (order_request_id, supplier_verification_status);

-- Existing submitted orders must still be explicitly checked; new orders inherit pending.
