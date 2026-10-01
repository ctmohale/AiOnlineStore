-- A source listing may legitimately expose only one product image. Keep every
-- genuine image we can collect, but do not hide a valid product merely because
-- the supplier did not publish three different views.
UPDATE products p
JOIN supplier_offers o
  ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
JOIN (
  SELECT product_id,COUNT(*) AS image_count
  FROM product_images
  WHERE url LIKE 'https://%'
  GROUP BY product_id
) gallery ON gallery.product_id=p.id
LEFT JOIN pricing_settings s ON s.id=1
SET p.status='published',
    p.gallery_image_count=gallery.image_count,
    p.review_reason=CASE
      WHEN o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)
        THEN 'supplier_confirmation_required'
      ELSE NULL
    END
WHERE p.deleted_at IS NULL
  AND p.status='paused'
  AND p.review_reason IN ('gallery_incomplete','catalogue_quality_gate','supplier_data_stale')
  AND gallery.image_count>=1
  AND o.price_verified=TRUE
  AND o.current_cost IS NOT NULL
  AND o.current_cost>0
  AND o.stock_status IN ('in_stock','low_stock')
  AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP());
