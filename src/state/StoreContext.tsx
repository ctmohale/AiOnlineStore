import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../data/products';
import { customerRequest } from '../lib/api';
import { clearCustomerToken, CUSTOMER_AUTH_EVENT, CUSTOMER_TOKEN_KEY, getCustomerToken } from '../lib/storage';
import { useCatalog } from './CatalogContext';

export type CartLine = { product: Product; quantity: number };
type StoreContextValue = {
  cart: CartLine[];
  add: (product: Product, quantity?: number) => void;
  update: (id: number, quantity: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = 'mzansi-mega-store-cart';
const CART_OWNER_KEY = 'mzansi-mega-store-cart-owner';
const LEGACY_CART_KEY = 'moya-cart';
type SavedCartLine = { productId: number; quantity: number };
type SavedCart = { customerId: number; items: SavedCartLine[] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { products, loading, error } = useCatalog();
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      if (localStorage.getItem(CART_OWNER_KEY) && !getCustomerToken()) {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(CART_OWNER_KEY);
        return [];
      }
      const stored = localStorage.getItem(CART_KEY) || localStorage.getItem(LEGACY_CART_KEY) || '[]';
      if (!localStorage.getItem(CART_KEY) && stored !== '[]') localStorage.setItem(CART_KEY, stored);
      localStorage.removeItem(LEGACY_CART_KEY);
      return JSON.parse(stored);
    } catch { return []; }
  });
  const cartRef = useRef(cart);
  const [customerToken, setCustomerTokenState] = useState(() => getCustomerToken());
  const [remoteReady, setRemoteReady] = useState(false);
  const replaceCart = useCallback((lines: CartLine[]) => { cartRef.current = lines; setCart(lines); }, []);
  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart]);
  useEffect(() => {
    const refreshToken = () => {
      const next = getCustomerToken();
      setCustomerTokenState((current) => {
        if (current && !next) { localStorage.removeItem(CART_OWNER_KEY); replaceCart([]); }
        return next;
      });
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, refreshToken);
    const storage = (event: StorageEvent) => { if (event.key === CUSTOMER_TOKEN_KEY) refreshToken(); };
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(CUSTOMER_AUTH_EVENT, refreshToken); window.removeEventListener('storage', storage); };
  }, [replaceCart]);
  useEffect(() => {
    if (loading || error) return;
    replaceCart(cartRef.current.flatMap((line) => {
      const current = products.find((product) => product.id === line.product.id);
      return current ? [{ product: current, quantity: line.quantity }] : [];
    }));
  }, [error, loading, products, replaceCart]);
  useEffect(() => {
    if (!customerToken) { setRemoteReady(false); return; }
    if (loading || error) return;
    let cancelled = false;
    setRemoteReady(false);
    void customerRequest<SavedCart>('/cart', { silent: true }).then(async (saved) => {
      if (cancelled) return;
      const merged = new Map<number, CartLine>();
      for (const item of saved.items) {
        const product = products.find((candidate) => candidate.id === Number(item.productId));
        if (product) merged.set(product.id, { product, quantity: Math.min(20, Number(item.quantity)) });
      }
      const cachedOwner = localStorage.getItem(CART_OWNER_KEY);
      if (!cachedOwner) {
        for (const line of cartRef.current) {
          const previous = merged.get(line.product.id);
          merged.set(line.product.id, { product: line.product, quantity: Math.min(20, Math.max(line.quantity, previous?.quantity || 0)) });
        }
      }
      const lines = [...merged.values()].slice(0, 50);
      replaceCart(lines);
      await customerRequest('/cart', { method: 'PUT', body: JSON.stringify({ items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }), silent: true });
      if (!cancelled) { localStorage.setItem(CART_OWNER_KEY, String(saved.customerId)); setRemoteReady(true); }
    }).catch((syncError) => {
      if (syncError instanceof Error && 'status' in syncError && syncError.status === 401) clearCustomerToken();
      else console.error('Customer cart could not be synchronized', syncError);
    });
    return () => { cancelled = true; };
  }, [customerToken, error, loading, products, replaceCart]);
  const persistLine = useCallback((productId: number, quantity: number) => {
    if (!customerToken || !remoteReady) return;
    const request = quantity < 1
      ? customerRequest(`/cart/items/${productId}`, { method: 'DELETE', silent: true })
      : customerRequest(`/cart/items/${productId}`, { method: 'PUT', body: JSON.stringify({ quantity }), silent: true });
    void request.catch((syncError) => console.error('Cart change could not be saved', syncError));
  }, [customerToken, remoteReady]);
  const value = useMemo(() => ({
    cart,
    add: (product: Product, quantity = 1) => {
      const lines = cartRef.current;
      const found = lines.find((line) => line.product.id === product.id);
      const nextQuantity = Math.min(20, (found?.quantity || 0) + quantity);
      replaceCart(found ? lines.map((line) => line.product.id === product.id ? { ...line, quantity: nextQuantity } : line) : [...lines, { product, quantity: nextQuantity }]);
      persistLine(product.id, nextQuantity);
    },
    update: (id: number, quantity: number) => {
      const nextQuantity = Math.min(20, quantity);
      replaceCart(nextQuantity < 1 ? cartRef.current.filter((line) => line.product.id !== id) : cartRef.current.map((line) => line.product.id === id ? { ...line, quantity: nextQuantity } : line));
      persistLine(id, nextQuantity);
    },
    remove: (id: number) => { replaceCart(cartRef.current.filter((line) => line.product.id !== id)); persistLine(id, 0); },
    clear: () => {
      replaceCart([]);
      if (customerToken && remoteReady) void customerRequest('/cart', { method: 'DELETE', silent: true }).catch((syncError) => console.error('Cart could not be cleared', syncError));
    },
    count: cart.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  }), [cart, customerToken, persistLine, remoteReady, replaceCart]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
};
