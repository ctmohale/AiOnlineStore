UPDATE pricing_settings
SET minimum_profit=GREATEST(minimum_profit,10),
    minimum_margin_percent=GREATEST(minimum_margin_percent,4)
WHERE id=1;
