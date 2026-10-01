ALTER TABLE products
  ADD COLUMN gallery_checked_at DATETIME NULL AFTER internal_review_notes,
  ADD COLUMN gallery_image_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER gallery_checked_at;

UPDATE products p
SET p.gallery_image_count=(SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id);

CREATE INDEX idx_products_gallery_check ON products (gallery_image_count, gallery_checked_at);
