ALTER TABLE supplier_offers
  ADD COLUMN fulfilment_type ENUM('store_stock','warehouse','online_only','unknown') NOT NULL DEFAULT 'unknown' AFTER stock_status,
  ADD COLUMN fulfilment_signal VARCHAR(255) NULL AFTER fulfilment_type;

ALTER TABLE order_items
  ADD COLUMN supplier_fulfilment_snapshot ENUM('store_stock','warehouse','online_only','unknown') NOT NULL DEFAULT 'unknown' AFTER supplier_unit_cost_snapshot,
  ADD COLUMN estimated_supplier_days_min INT UNSIGNED NULL AFTER supplier_fulfilment_snapshot,
  ADD COLUMN estimated_supplier_days_max INT UNSIGNED NULL AFTER estimated_supplier_days_min;

ALTER TABLE order_requests
  ADD COLUMN delivery_estimate_min_days INT UNSIGNED NULL AFTER expected_delivery_at,
  ADD COLUMN delivery_estimate_max_days INT UNSIGNED NULL AFTER delivery_estimate_min_days,
  ADD COLUMN delivery_estimate_basis VARCHAR(500) NULL AFTER delivery_estimate_max_days;
