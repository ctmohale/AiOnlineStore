import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, type Product } from '../data/products';
import { useStore } from '../state/StoreContext';
import { useFeedback } from './FeedbackProvider';
import ProductVisual from './ProductVisual';
import { productSale } from '../lib/productSale';

export default function ProductCard({ product }: { product: Product }) {
  const sale = productSale(product);
  const { add } = useStore();
  const { notify } = useFeedback();
  return <article className="product-card">
    <Link to={`/product/${product.slug}`} className="product-image">
      {sale && <span className="product-sale-sticker">{sale.discountLabel} OFF</span>}
      {product.badge && <span className="product-badge">{product.badge}</span>}
      <ProductVisual product={product} showModel={false} />
      <span className="view-product">View product <ArrowRight size={15} /></span>
    </Link>
    <div className="product-copy">
      <p className="eyebrow">{product.category} · {product.packSize}</p>
      <Link to={`/product/${product.slug}`}><h3>{product.name}</h3></Link>
      <div className="price-row"><strong>{money(product.price)}</strong>{sale && <del>{money(product.compareAt!)}</del>}</div>
      {sale && <p className="product-sale-end">{sale.endLabel}</p>}
      <div className="stock-line"><span></span> Available to order</div>
      <button type="button" className="quick-add" onClick={() => { add(product); notify(`${product.name} was added to your cart.`, 'success', 'Added to cart'); }}><Plus size={17} /> Add to cart</button>
    </div>
  </article>;
}
