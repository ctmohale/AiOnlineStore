-- Keep simulated payments distinct from verified real payments and fulfilment.
ALTER TABLE order_requests
  MODIFY COLUMN status ENUM('requested','checking_supplier','quoted','awaiting_payment','paid','purchasing','shipped','delivered','cancelled','refunded','test_paid') NOT NULL DEFAULT 'requested',
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER status,
  ADD COLUMN test_paid_at DATETIME NULL AFTER quoted_at;
