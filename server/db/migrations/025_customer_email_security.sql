ALTER TABLE customers
  ADD COLUMN email_verified_at TIMESTAMP NULL AFTER phone;

UPDATE customers
SET email_verified_at = created_at
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_email_challenges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customer_email_challenge_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_customer_email_challenge_lookup (customer_id, purpose, consumed_at, created_at),
  INDEX idx_customer_email_challenge_expiry (expires_at)
);
