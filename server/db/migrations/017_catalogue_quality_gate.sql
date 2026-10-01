UPDATE products p
LEFT JOIN supplier_offers o
  ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
LEFT JOIN pricing_settings s ON s.id=1
SET p.status='paused',
    p.review_reason=CASE
      WHEN p.gallery_image_count<3 THEN 'gallery_incomplete'
      WHEN o.id IS NULL OR o.price_verified=FALSE OR o.current_cost IS NULL OR o.current_cost<=0 THEN 'supplier_price_unverified'
      WHEN o.stock_status NOT IN ('in_stock','low_stock') THEN 'supplier_stock_unverified'
      WHEN o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR) THEN 'supplier_data_stale'
      WHEN o.promotion_end_at IS NOT NULL AND o.promotion_end_at<=UTC_TIMESTAMP() THEN 'promotion_expired'
      ELSE 'catalogue_quality_gate'
    END
WHERE p.status='published'
  AND (
    p.gallery_image_count<3
    OR o.id IS NULL
    OR o.price_verified=FALSE
    OR o.current_cost IS NULL
    OR o.current_cost<=0
    OR o.stock_status NOT IN ('in_stock','low_stock')
    OR o.last_checked_at IS NULL
    OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)
    OR (o.promotion_end_at IS NOT NULL AND o.promotion_end_at<=UTC_TIMESTAMP())
  );
