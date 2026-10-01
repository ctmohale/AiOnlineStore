CREATE TABLE IF NOT EXISTS product_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED,
  previous_status VARCHAR(40) NOT NULL,
  decision VARCHAR(40) NOT NULL,
  checklist JSON NOT NULL,
  notes VARCHAR(5000),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_product_reviews_product (product_id, created_at)
);

CREATE INDEX idx_product_images_order ON product_images (product_id, sort_order);
