ALTER TABLE products
  ADD COLUMN shipping_weight_kg DECIMAL(10,3) NULL,
  ADD COLUMN shipping_length_cm DECIMAL(10,2) NULL,
  ADD COLUMN shipping_width_cm DECIMAL(10,2) NULL,
  ADD COLUMN shipping_height_cm DECIMAL(10,2) NULL;

ALTER TABLE order_requests
  ADD COLUMN shipping_provider VARCHAR(80) NULL,
  ADD COLUMN shipping_service_code VARCHAR(120) NULL,
  ADD COLUMN shipping_service_name VARCHAR(160) NULL,
  ADD COLUMN bobgo_rate_amount DECIMAL(12,2) NULL,
  ADD COLUMN bobgo_shipment_id VARCHAR(120) NULL,
  ADD COLUMN bobgo_submission_status VARCHAR(80) NULL,
  ADD COLUMN bobgo_provider_shipment_id VARCHAR(160) NULL,
  ADD COLUMN bobgo_last_sync_at DATETIME NULL,
  ADD COLUMN bobgo_last_error TEXT NULL;

CREATE TABLE IF NOT EXISTS bobgo_webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(190) NOT NULL UNIQUE,
  topic VARCHAR(120) NULL,
  payload JSON NOT NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bobgo_webhook_created (created_at)
);
