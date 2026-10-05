ALTER TABLE payment_references
  ADD COLUMN expected_amount_cents INT UNSIGNED NULL AFTER external_reference,
  ADD COLUMN currency CHAR(3) NULL AFTER expected_amount_cents,
  ADD COLUMN processing_mode VARCHAR(10) NULL AFTER currency,
  ADD COLUMN provider_payment_id VARCHAR(255) NULL AFTER processing_mode,
  ADD COLUMN failure_reason VARCHAR(500) NULL AFTER provider_payment_id,
  ADD INDEX idx_payment_order_status (order_request_id, verification_status);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider ENUM('yoco') NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  checkout_id VARCHAR(255) NULL,
  provider_payment_id VARCHAR(255) NULL,
  amount_cents INT UNSIGNED NULL,
  currency CHAR(3) NULL,
  processing_mode VARCHAR(10) NULL,
  processing_outcome VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_payment_webhook_event (provider, event_id),
  INDEX idx_payment_webhook_checkout (checkout_id)
);
