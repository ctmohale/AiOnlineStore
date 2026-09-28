ALTER TABLE order_requests
  ADD COLUMN courier_name VARCHAR(120) NULL AFTER notes,
  ADD COLUMN tracking_number VARCHAR(160) NULL AFTER courier_name,
  ADD COLUMN tracking_url VARCHAR(1500) NULL AFTER tracking_number,
  ADD COLUMN shipped_at DATETIME NULL AFTER test_paid_at;
