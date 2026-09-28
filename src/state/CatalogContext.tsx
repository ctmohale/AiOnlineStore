import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mapPublicProduct, type Product, type PublicProductRow } from '../data/products';
import { publicRequest } from '../lib/api';

export type StoreSettings = { freeDeliveryThreshold: number; standardCustomerDelivery: number };
type CatalogContextValue = { products: Product[]; settings: StoreSettings | null; loading: boolean; error: string; refresh: () => Promise<void> };
const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rows, storeSettings] = await Promise.all([publicRequest<PublicProductRow[]>('/products'), publicRequest<StoreSettings>('/store-settings')]);
      setProducts(rows.map(mapPublicProduct)); setSettings(storeSettings);
    } catch (requestError) {
      setProducts([]); setSettings(null); setError(requestError instanceof Error ? requestError.message : 'The live catalogue could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ products, settings, loading, error, refresh }), [products, settings, loading, error, refresh]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCatalog = () => {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside CatalogProvider');
  return value;
};
