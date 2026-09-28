-- Replace small Makro catalogue thumbnails with the CDN's larger high-quality variant.
UPDATE product_images
SET url = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(url, '/416/416/', '/1200/1200/'),
      '/832/832/', '/1200/1200/'
    ),
    'q=70', 'q=95'
  ),
  'q=90', 'q=95'
)
WHERE url LIKE 'https://www.makro.co.za/asset/rukmini/fccp/%';
