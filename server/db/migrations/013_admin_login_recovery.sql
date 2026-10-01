UPDATE admins
SET email='mohalebrown@gmail.com',
    password_hash='$2b$12$H96Rg6wlsYLCq6nXQ0Cb1uc4BMOyPmv0SCLf9T59lo4TF8eYUGKTC',
    name='Store Administrator',
    role='admin'
WHERE role='admin'
ORDER BY id
LIMIT 1;
