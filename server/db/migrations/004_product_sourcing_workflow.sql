ALTER TABLE products
  ADD COLUMN minimum_profit DECIMAL(12,2) NULL AFTER selling_price,
  ADD COLUMN estimated_customer_delivery_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER minimum_profit,
  ADD COLUMN delivery_time VARCHAR(120) NULL AFTER estimated_customer_delivery_cost,
  ADD COLUMN item_weight_size VARCHAR(120) NULL AFTER delivery_time,
  ADD COLUMN internal_review_notes TEXT NULL AFTER item_weight_size;

ALTER TABLE supplier_offers
  MODIFY COLUMN current_cost DECIMAL(12,2) NULL,
  MODIFY COLUMN last_checked_at DATETIME NULL,
  ADD COLUMN supplier_sku VARCHAR(120) NULL AFTER source_url,
  ADD COLUMN supplier_delivery_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER original_displayed_price,
  ADD COLUMN promotion_start_at DATETIME NULL AFTER supplier_delivery_cost,
  ADD COLUMN promotion_end_provided BOOLEAN NOT NULL DEFAULT FALSE AFTER promotion_end_at,
  ADD COLUMN promotion_terms TEXT NULL AFTER promotion_end_provided,
  ADD COLUMN quantity_limit VARCHAR(255) NULL AFTER promotion_terms,
  ADD COLUMN source_confidence ENUM('low','medium','high') NOT NULL DEFAULT 'low' AFTER stock_status,
  ADD COLUMN price_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER source_confidence,
  ADD COLUMN price_updated_at DATETIME NULL AFTER price_verified,
  ADD COLUMN price_change_reason VARCHAR(255) NULL AFTER price_updated_at;
