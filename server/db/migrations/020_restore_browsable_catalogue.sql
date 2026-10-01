-- Supplier data becoming older than the automatic refresh window must not remove
-- an otherwise valid product from the request-first storefront. Exact stock and
-- checkout pricing are verified by operations before a quote or payment link.
UPDATE products p
JOIN supplier_offers o
  ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
SET p.status='published',
    p.review_reason='supplier_confirmation_required'
WHERE p.deleted_at IS NULL
  AND p.status='paused'
  AND p.review_reason='supplier_data_stale'
  AND p.gallery_image_count>=3
  AND o.price_verified=TRUE
  AND o.current_cost IS NOT NULL
  AND o.current_cost>0
  AND o.stock_status IN ('in_stock','low_stock')
  AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP());
