import { beginLoading } from './loading';
import { getAdminToken, getCustomerToken } from './storage';

export type OrderPayload = {
  customer: { name: string; email: string; phone: string; addressLine1: string; suburb: string; city: string; province: string; postalCode: string; notes?: string };
  items: { productId: number; quantity: number; agreedUnitPrice: number }[];
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function publicRequest<T>(path: string) {
  const finishLoading = beginLoading();
  try {
    const response = await fetch(`${API_URL}${path}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || 'The requested data could not be loaded');
    return body as T;
  } finally { finishLoading(); }
}

export async function createOrder(payload: OrderPayload) {
  const finishLoading = beginLoading();
  try {
    const token = getCustomerToken();
    if (!token) throw Object.assign(new Error('Sign in or create an account before continuing to payment.'), { status: 401 });
    const response = await fetch(`${API_URL}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body?.error || 'Unable to submit order request'), { status: response.status });
    return body as { reference: string; status: string; paymentLink: string | null; processingMode?: 'test' | 'live'; paymentError?: string };
  } finally { finishLoading(); }
}

export type Customer = { id: number; email: string; name: string; phone: string | null; created_at?: string };
export type CustomerOrder = { reference: string; status: string; courier_name?: string | null; tracking_number?: string | null; tracking_url?: string | null; expected_ship_at?: string | null; expected_delivery_at?: string | null; delivered_at?: string | null; item_summary: string; product_revenue: number; customer_delivery_charged: number; created_at: string; payment_link?: string | null; payment_provider?: string | null };

type CustomerAuthResult = { token: string; customer: Customer };
type CustomerVerificationPending = { verificationRequired: true; email: string; expiresInSeconds: number; resendAfterSeconds: number };

async function customerPublicRequest<T>(path: string, payload: Record<string, string>) {
  const finishLoading = beginLoading();
  try {
    const response = await fetch(`${API_URL}/customer/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw Object.assign(new Error(body?.error || 'Unable to continue'), { status: response.status, body });
    return body as T;
  } finally { finishLoading(); }
}

export const customerLogin = (email: string, password: string) => customerPublicRequest<CustomerAuthResult>('login', { email, password });
export const customerRegister = (name: string, email: string, phone: string, password: string) => customerPublicRequest<CustomerVerificationPending>('register', { name, email, phone, password });
export const customerVerifyEmail = (email: string, code: string) => customerPublicRequest<CustomerAuthResult>('verify-email', { email, code });
export const customerResendVerification = (email: string) => customerPublicRequest<{ message: string; expiresInSeconds: number; resendAfterSeconds: number }>('resend-verification', { email });
export const customerForgotPassword = (email: string) => customerPublicRequest<{ message: string; expiresInSeconds: number; resendAfterSeconds: number }>('forgot-password', { email });
export const customerResetPassword = (email: string, code: string, newPassword: string) => customerPublicRequest<null>('reset-password', { email, code, newPassword });

type CustomerRequestOptions = RequestInit & { silent?: boolean };

export async function customerRequest<T>(path: string, options: CustomerRequestOptions = {}) {
  const { silent = false, ...requestOptions } = options;
  const finishLoading = silent ? () => undefined : beginLoading();
  try {
    const token = getCustomerToken();
    const response = await fetch(`${API_URL}/customer${path}`, { ...requestOptions, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...requestOptions.headers } });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || 'Unable to load your account'), { status: response.status });
    return body as T;
  } finally { finishLoading(); }
}

export async function adminLogin(email: string, password: string) {
  const finishLoading = beginLoading();
  try {
    const response = await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to sign in');
    return body as { token: string };
  } finally { finishLoading(); }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}) {
  const finishLoading = beginLoading();
  try {
    const token = getAdminToken();
    const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (response.status === 401) { localStorage.removeItem('mzansi-mega-store-admin-token'); sessionStorage.removeItem('mzansi-mega-store-admin-token'); }
      throw Object.assign(new Error(body?.error || 'Admin request failed'), { status: response.status });
    }
    return body as T;
  } finally { finishLoading(); }
}
