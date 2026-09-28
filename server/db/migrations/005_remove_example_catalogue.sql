DELETE ph
FROM price_history ph
JOIN products p ON p.id = ph.product_id
WHERE p.slug IN (
  'wahl-cutek-wh5439-216-hairdryer',
  'pampers-pants-active-baby-size-6-96',
  'wahl-barber-kit-9247'
)
AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);

DELETE p
FROM products p
WHERE p.slug IN (
  'wahl-cutek-wh5439-216-hairdryer',
  'pampers-pants-active-baby-size-6-96',
  'wahl-barber-kit-9247'
)
AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);
