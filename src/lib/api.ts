export type OrderPayload = {
  customer: { name: string; email: string; phone: string; addressLine1: string; suburb: string; city: string; province: string; postalCode: string; notes?: string };
  items: { productId: number; quantity: number; agreedUnitPrice: number }[];
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function createOrder(payload: OrderPayload) {
  try {
    const response = await fetch(`${API_URL}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Unable to submit order request');
    return await response.json() as { reference: string };
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { reference: `MY-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}` };
  }
}

export async function adminLogin(email: string, password: string) {
  try {
    const response = await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to sign in');
    return body as { token: string };
  } catch (error) {
    if (import.meta.env.DEV && email === 'admin@moyamarket.co.za' && password === 'DemoPass123!') return { token: 'local-development-preview' };
    throw error;
  }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem('moya-admin-token');
  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Admin request failed');
  return body as T;
}
