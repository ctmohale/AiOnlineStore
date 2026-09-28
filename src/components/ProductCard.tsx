import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, type Product } from '../data/products';
import { useStore } from '../state/StoreContext';
import { useFeedback } from './FeedbackProvider';
import ProductVisual from './ProductVisual';

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useStore();
  const { notify } = useFeedback();
  return <article className="product-card">
    <Link to={`/product/${product.slug}`} className="product-image" style={{ background: product.accent }}>
      {product.badge && <span className="product-badge">{product.badge}</span>}
      <ProductVisual product={product} />
      <span className="view-product">View product <ArrowRight size={15} /></span>
    </Link>
    <div className="product-copy">
      <p className="eyebrow">{product.category} · {product.packSize}</p>
      <Link to={`/product/${product.slug}`}><h3>{product.name}</h3></Link>
      <p className="product-model">{product.model}</p>
      <div className="price-row"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
      <div className="stock-line"><span></span> Stock confirmed before payment</div>
      <button type="button" className="quick-add" onClick={() => { add(product); notify(`${product.name} was added to your cart.`, 'success', 'Added to cart'); }}><Plus size={17} /> Add to cart</button>
    </div>
  </article>;
}
