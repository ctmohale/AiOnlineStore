INSERT INTO admins (email,password_hash,name,role)
VALUES ('mohalebrown@gmail.com','$2b$12$H96Rg6wlsYLCq6nXQ0Cb1uc4BMOyPmv0SCLf9T59lo4TF8eYUGKTC','Store Administrator','admin')
ON DUPLICATE KEY UPDATE
  password_hash=VALUES(password_hash),
  name=VALUES(name),
  role='admin';
