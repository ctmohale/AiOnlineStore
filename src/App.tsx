import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './state/StoreContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Confirmation from './pages/Confirmation';
import Account from './pages/Account';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import CatalogShare from './pages/CatalogShare';
import PolicyPage from './pages/PolicyPage';
import { FeedbackProvider } from './components/FeedbackProvider';
import { CatalogProvider } from './state/CatalogContext';
import GlobalLoading from './components/GlobalLoading';
import './App.css';

export default function App() {
  return (
    <FeedbackProvider>
      <GlobalLoading />
      <BrowserRouter>
        <CatalogProvider>
          <StoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:slug" element={<ProductDetail />} />
            <Route path="/catalog" element={<CatalogShare />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/request" element={<Checkout />} />
            <Route path="/confirmation/:reference" element={<Confirmation />} />
            <Route path="/account" element={<Account />} />
            <Route path="/:page" element={<PolicyPage />} />
          </Route>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </StoreProvider>
        </CatalogProvider>
      </BrowserRouter>
    </FeedbackProvider>
  );
}
