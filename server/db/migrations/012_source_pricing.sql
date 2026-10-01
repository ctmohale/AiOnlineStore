ALTER TABLE pricing_settings
  ADD COLUMN standard_markup_percent DECIMAL(5,2) NOT NULL DEFAULT 7.00 AFTER minimum_margin_percent;

UPDATE pricing_settings SET minimum_profit=0,minimum_margin_percent=0,standard_markup_percent=7 WHERE id=1;
UPDATE products SET minimum_profit=NULL WHERE minimum_profit=120;
