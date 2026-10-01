-- Preserve the supplier information used at checkout and capture the complete
-- operational trail required to purchase, ship, reconcile and support an order.
ALTER TABLE order_items
  ADD COLUMN supplier_retailer_snapshot VARCHAR(120) NULL AFTER supplier_checkout_unit_cost,
  ADD COLUMN supplier_source_url_snapshot VARCHAR(1500) NULL AFTER supplier_retailer_snapshot,
  ADD COLUMN supplier_sku_snapshot VARCHAR(120) NULL AFTER supplier_source_url_snapshot,
  ADD COLUMN supplier_unit_cost_snapshot DECIMAL(12,2) NULL AFTER supplier_sku_snapshot;

ALTER TABLE order_requests
  ADD COLUMN supplier_order_reference VARCHAR(190) NULL AFTER tracking_url,
  ADD COLUMN supplier_order_url VARCHAR(1500) NULL AFTER supplier_order_reference,
  ADD COLUMN fulfilment_notes TEXT NULL AFTER supplier_order_url,
  ADD COLUMN supplier_checked_at DATETIME NULL AFTER shipped_at,
  ADD COLUMN purchased_at DATETIME NULL AFTER supplier_checked_at,
  ADD COLUMN expected_ship_at DATETIME NULL AFTER purchased_at,
  ADD COLUMN expected_delivery_at DATETIME NULL AFTER expected_ship_at,
  ADD COLUMN delivered_at DATETIME NULL AFTER expected_delivery_at,
  ADD COLUMN cancelled_at DATETIME NULL AFTER delivered_at,
  ADD COLUMN refunded_at DATETIME NULL AFTER cancelled_at,
  ADD COLUMN actual_supplier_product_cost DECIMAL(12,2) NULL AFTER expected_profit,
  ADD COLUMN actual_supplier_delivery DECIMAL(12,2) NULL AFTER actual_supplier_product_cost,
  ADD COLUMN actual_customer_delivery_cost DECIMAL(12,2) NULL AFTER actual_supplier_delivery,
  ADD COLUMN actual_packaging_cost DECIMAL(12,2) NULL AFTER actual_customer_delivery_cost,
  ADD COLUMN actual_payment_fee DECIMAL(12,2) NULL AFTER actual_packaging_cost,
  ADD COLUMN actual_advertising_cost DECIMAL(12,2) NULL AFTER actual_payment_fee,
  ADD COLUMN actual_profit DECIMAL(12,2) NULL AFTER actual_advertising_cost,
  ADD INDEX idx_orders_expected_delivery (expected_delivery_at),
  ADD INDEX idx_orders_paid_reporting (is_test, status, created_at);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  note VARCHAR(500) NULL,
  changed_by_admin_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_request_id) REFERENCES order_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_order_history (order_request_id, created_at)
);

INSERT INTO order_status_history (order_request_id, from_status, to_status, note)
SELECT id, NULL, status, 'Existing order state captured during fulfilment upgrade'
FROM order_requests;
