-- Public product images from the exact supplier listings, selected by product title.
-- Preserve any photo already set by an administrator. Rights confirmation remains unset.
INSERT INTO product_images (product_id, url, alt_text, sort_order)
SELECT p.id, source_photos.image_url, p.title, 0
FROM products p
JOIN (
  SELECT 'Black & Decker MKM100-B5 1000 W Stand Mixer' AS title, 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/hand-blender/v/4/t/-original-imahdfvhzqsrthtp.jpeg?q=70' AS image_url
  UNION ALL SELECT 'Philips HR3705/10 300 W Electric Whisk', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/hand-blender/i/h/s/philips-original-imah5e82zbqds3xe.jpeg?q=70'
  UNION ALL SELECT 'Lola SM-1504 1100 W Stand Mixer', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/hand-blender/w/t/s/lola-original-imahf7ysemh9ymff.jpeg?q=70'
  UNION ALL SELECT 'Milex Nutri 1200 1200 W Hand Blender', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/hand-blender/r/5/c/milex-original-imah53fumzbbk9bc.jpeg?q=70'
  UNION ALL SELECT 'Wahl Classic Series Clipper Grooming Kit', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/trimmer/a/a/c/carton-0-5-8-mm-classic-series-clipper-stainless-steel-corded-original-imah6ep4ghs6upxb.jpeg?q=70'
  UNION ALL SELECT 'Wahl 18 Piece Hair Clipper Kit Cordless Trimmer', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/trimmer/s/h/r/box-0-25-4-mm-18-piece-hair-clipper-kit-cordless-stainless-steel-original-imahhts4hz2chbgm.jpeg?q=70'
  UNION ALL SELECT 'Wahl Smooth Cut Pro Corded Hair Clipper Kit', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/trimmer/t/f/b/carton-0-25-4-mm-smooth-cut-pro-corded-hair-clipper-kit-original-imah6agyshzybmza.jpeg?q=70'
  UNION ALL SELECT 'Wahl Cutek 2000 W Professional AC Hair Dryer', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/hair-dryer/y/j/a/wahl-original-imah6ztsrarsz3by.jpeg?q=70'
  UNION ALL SELECT 'Huggies Dry Comfort Jumbo Pack Size 1 Tape Diapers', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/diaper/a/u/p/1-dry-comfort-jumbo-pack-size-1-diapers-84-s-pack-84-huggies-original-imahn75hgews39bh.jpeg?q=70'
  UNION ALL SELECT 'Huggies Extra Care Nappies Size 2 Tape Diapers', 'https://www.makro.co.za/asset/rukmini/fccp/416/416/ng-fkpublic-ui-user-fbbe/diaper/j/n/d/2-extra-care-nappies-each-1-huggies-original-imahaaysvxrvhghq.jpeg?q=70'
) source_photos ON source_photos.title = p.title
WHERE p.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.sort_order = 0);
