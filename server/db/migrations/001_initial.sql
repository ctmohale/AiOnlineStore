CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('admin','operator') NOT NULL DEFAULT 'operator',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  brand VARCHAR(120) NOT NULL,
  model VARCHAR(120) NOT NULL,
  barcode VARCHAR(64),
  pack_size VARCHAR(120) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  specifications JSON NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL,
  status ENUM('draft','pending_review','published','paused','unavailable') NOT NULL DEFAULT 'draft',
  review_reason VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_status (status),
  INDEX idx_exact_model (brand, model, pack_size),
  INDEX idx_barcode (barcode)
);

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(1000) NOT NULL,
  alt_text VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  rights_confirmed_at DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  retailer VARCHAR(120) NOT NULL,
  source_url VARCHAR(1500) NOT NULL,
  brand VARCHAR(120) NOT NULL,
  model VARCHAR(120) NOT NULL,
  barcode VARCHAR(64),
  pack_size VARCHAR(120) NOT NULL,
  current_cost DECIMAL(12,2) NOT NULL,
  original_displayed_price DECIMAL(12,2),
  promotion_end_at DATETIME,
  stock_status ENUM('in_stock','low_stock','out_of_stock','unknown') NOT NULL DEFAULT 'unknown',
  last_checked_at DATETIME NOT NULL,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_offer_recheck (promotion_end_at, last_checked_at),
  INDEX idx_offer_product (product_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  supplier_offer_id BIGINT UNSIGNED,
  supplier_cost DECIMAL(12,2),
  selling_price DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  changed_by_admin_id BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (supplier_offer_id) REFERENCES supplier_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  adapter VARCHAR(80) NOT NULL,
  status ENUM('running','completed','failed') NOT NULL,
  records_seen INT NOT NULL DEFAULT 0,
  records_created INT NOT NULL DEFAULT 0,
  records_flagged INT NOT NULL DEFAULT 0,
  error_log JSON,
  started_at DATETIME NOT NULL,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS order_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(40) NOT NULL UNIQUE,
  customer_name VARCHAR(160) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  address_line_1 VARCHAR(255) NOT NULL,
  suburb VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  notes TEXT,
  status ENUM('requested','checking_supplier','quoted','awaiting_payment','paid','purchasing','shipped','delivered','cancelled','refunded') NOT NULL DEFAULT 'requested',
  product_revenue DECIMAL(12,2) NOT NULL,
  customer_delivery_charged DECIMAL(12,2) NOT NULL DEFAULT 0,
  supplier_product_cost DECIMAL(12,2),
  supplier_delivery DECIMAL(12,2),
  customer_delivery_cost DECIMAL(12,2),
  packaging_cost DECIMAL(12,2),
  payment_fee_estimate DECIMAL(12,2),
  advertising_cost DECIMAL(12,2),
  expected_profit DECIMAL(12,2),
  quoted_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_request_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_title_snapshot VARCHAR(255) NOT NULL,
  model_snapshot VARCHAR(120) NOT NULL,
  pack_size_snapshot VARCHAR(120) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  agreed_unit_price DECIMAL(12,2) NOT NULL,
  supplier_checkout_unit_cost DECIMAL(12,2),
  FOREIGN KEY (order_request_id) REFERENCES order_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payment_references (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_request_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('yoco','paystack','other') NOT NULL,
  payment_link VARCHAR(1500) NOT NULL,
  external_reference VARCHAR(255) NOT NULL,
  verification_status ENUM('unverified','verified','failed','refunded') NOT NULL DEFAULT 'unverified',
  verified_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_request_id) REFERENCES order_requests(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_payment_provider_reference (provider, external_reference)
);

CREATE TABLE IF NOT EXISTS pricing_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  minimum_profit DECIMAL(12,2) NOT NULL DEFAULT 120,
  minimum_margin_percent DECIMAL(7,2) NOT NULL DEFAULT 15,
  free_delivery_threshold DECIMAL(12,2) NOT NULL DEFAULT 999,
  standard_customer_delivery DECIMAL(12,2) NOT NULL DEFAULT 89,
  supplier_stale_hours INT NOT NULL DEFAULT 24,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT single_settings_row CHECK (id = 1)
);

INSERT INTO pricing_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id=id;
