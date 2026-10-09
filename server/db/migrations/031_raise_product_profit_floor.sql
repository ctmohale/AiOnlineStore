UPDATE pricing_settings
SET minimum_profit=GREATEST(minimum_profit,20),
    minimum_margin_percent=GREATEST(minimum_margin_percent,5)
WHERE id=1;
