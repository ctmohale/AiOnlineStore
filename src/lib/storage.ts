export const CUSTOMER_TOKEN_KEY = 'mzansi-mega-store-customer-token';
export const ADMIN_TOKEN_KEY = 'mzansi-mega-store-admin-token';
export const CUSTOMER_AUTH_EVENT = 'mzansi-customer-auth-changed';

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
export const setCustomerToken = (token: string) => {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT));
};
export const clearCustomerToken = () => {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT));
};
export const getAdminToken = () => {
  const current = migrate(localStorage, ADMIN_TOKEN_KEY, 'moya-admin-token');
  if (current) return current;
  const sessionToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem('moya-admin-token');
  if (!sessionToken) return null;
  localStorage.setItem(ADMIN_TOKEN_KEY, sessionToken);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem('moya-admin-token');
  return sessionToken;
};
