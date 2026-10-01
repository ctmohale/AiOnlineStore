import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Product } from '../data/products';
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
const LEGACY_CART_KEY = 'moya-cart';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { products, loading, error } = useCatalog();
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY) || localStorage.getItem(LEGACY_CART_KEY) || '[]';
      if (!localStorage.getItem(CART_KEY) && stored !== '[]') localStorage.setItem(CART_KEY, stored);
      localStorage.removeItem(LEGACY_CART_KEY);
      return JSON.parse(stored);
    } catch { return []; }
  });
  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart]);
  useEffect(() => {
    if (loading || error) return;
    setCart((lines) => lines.flatMap((line) => {
      const current = products.find((product) => product.id === line.product.id);
      return current ? [{ product: current, quantity: line.quantity }] : [];
    }));
  }, [error, loading, products]);
  const value = useMemo(() => ({
    cart,
    add: (product: Product, quantity = 1) => setCart((lines) => {
      const found = lines.find((line) => line.product.id === product.id);
      return found ? lines.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + quantity } : line) : [...lines, { product, quantity }];
    }),
    update: (id: number, quantity: number) => setCart((lines) => quantity < 1 ? lines.filter((line) => line.product.id !== id) : lines.map((line) => line.product.id === id ? { ...line, quantity } : line)),
    remove: (id: number) => setCart((lines) => lines.filter((line) => line.product.id !== id)),
    clear: () => setCart([]),
    count: cart.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  }), [cart]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
};
