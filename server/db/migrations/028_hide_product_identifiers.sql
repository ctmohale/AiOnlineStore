CREATE TABLE IF NOT EXISTS product_slug_aliases (
  slug VARCHAR(190) PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_slug_alias_product (product_id),
  CONSTRAINT fk_product_slug_alias_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

INSERT IGNORE INTO product_slug_aliases (slug, product_id)
SELECT slug, id
FROM products
WHERE slug REGEXP '(^|-)[0-9]{8,}(-|$)';

UPDATE products
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(slug, '(^|-)[0-9]{8,}(-|$)', '-'), '-+', '-'))
WHERE slug REGEXP '(^|-)[0-9]{8,}(-|$)';
