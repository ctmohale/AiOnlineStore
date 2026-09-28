import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, type Product } from '../data/products';
import { useStore } from '../state/StoreContext';

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useStore();
  return <article className="product-card">
    <Link to={`/product/${product.slug}`} className="product-image" style={{ background: product.accent }}>
      {product.badge && <span className="product-badge">{product.badge}</span>}
      {product.image ? <img src={product.image} alt={product.name} /> : <span className="product-placeholder"><small>Image coming soon</small><b>{product.brand}</b><em>{product.model}</em></span>}
      <span className="view-product">View product <ArrowRight size={15} /></span>
    </Link>
    <div className="product-copy">
      <p className="eyebrow">{product.category} · {product.packSize}</p>
      <Link to={`/product/${product.slug}`}><h3>{product.name}</h3></Link>
      <p className="product-model">{product.model}</p>
      <div className="price-row"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
      <div className="stock-line"><span></span> Stock confirmed before payment</div>
      <button className="quick-add" onClick={() => add(product)}><Plus size={17} /> Add to cart</button>
    </div>
  </article>;
}
