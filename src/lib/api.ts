export type OrderPayload = {
  testMode?: boolean;
  customer: { name: string; email: string; phone: string; addressLine1: string; suburb: string; city: string; province: string; postalCode: string; notes?: string };
  items: { productId: number; quantity: number; agreedUnitPrice: number }[];
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function publicRequest<T>(path: string) {
  const response = await fetch(`${API_URL}${path}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || 'The requested data could not be loaded');
  return body as T;
}

export async function createOrder(payload: OrderPayload) {
  const token = localStorage.getItem('moya-customer-token');
  const response = await fetch(`${API_URL}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || 'Unable to submit order request');
  return body as { reference: string };
}

export type Customer = { id: number; email: string; name: string; phone: string | null; created_at?: string };
export type CustomerOrder = { reference: string; status: string; is_test: number | boolean; test_paid_at?: string | null; item_summary: string; product_revenue: number; customer_delivery_charged: number; created_at: string };

export async function testPayment(reference: string, outcome: 'success' | 'failure') {
  const token = localStorage.getItem('moya-customer-token');
  const response = await fetch(`${API_URL}/customer/orders/${encodeURIComponent(reference)}/test-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ outcome }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Test payment could not be completed');
  return body as { status: 'test_paid' | 'test_failed'; charged: false };
}

async function customerAuth(path: 'login' | 'register', payload: Record<string, string>) {
  const response = await fetch(`${API_URL}/customer/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to continue');
  return body as { token: string; customer: Customer };
}

export const customerLogin = (email: string, password: string) => customerAuth('login', { email, password });
export const customerRegister = (name: string, email: string, phone: string, password: string) => customerAuth('register', { name, email, phone, password });

export async function customerRequest<T>(path: string) {
  const token = localStorage.getItem('moya-customer-token');
  const response = await fetch(`${API_URL}/customer${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load your account');
  return body as T;
}

export async function adminLogin(email: string, password: string) {
  const response = await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to sign in');
  return body as { token: string };
}

export async function adminRequest<T>(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem('moya-admin-token');
  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'Admin request failed');
  return body as T;
}
