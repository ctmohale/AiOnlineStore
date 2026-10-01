export const CUSTOMER_TOKEN_KEY = 'mzansi-mega-store-customer-token';
export const ADMIN_TOKEN_KEY = 'mzansi-mega-store-admin-token';

const migrate = (storage: Storage, currentKey: string, legacyKey: string) => {
  const current = storage.getItem(currentKey);
  if (current) return current;
  const legacy = storage.getItem(legacyKey);
  if (!legacy) return null;
  storage.setItem(currentKey, legacy);
  storage.removeItem(legacyKey);
  return legacy;
};

export const getCustomerToken = () => migrate(localStorage, CUSTOMER_TOKEN_KEY, 'moya-customer-token');
export const getAdminToken = () => migrate(sessionStorage, ADMIN_TOKEN_KEY, 'moya-admin-token');
