-- Increase existing Makro product photos to a Retina-friendly source size and full JPEG quality.
UPDATE product_images
SET url = REPLACE(
  REPLACE(url, '/1200/1200/', '/1600/1600/'),
  'q=95', 'q=100'
)
WHERE url LIKE 'https://www.makro.co.za/asset/rukmini/fccp/%';
