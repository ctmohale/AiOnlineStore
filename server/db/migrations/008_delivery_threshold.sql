-- Apply the agreed free-delivery threshold to the existing deployment.
-- Preserve any later custom threshold an administrator may have set.
UPDATE pricing_settings SET free_delivery_threshold = 500 WHERE id = 1 AND free_delivery_threshold = 999;
