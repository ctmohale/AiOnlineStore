import { useState } from 'react';
import type { Product } from '../data/products';

type VisualKind = 'mixer' | 'whisk' | 'blender' | 'clipper' | 'dryer' | 'diapers';

function kindFor(product: Product): VisualKind {
  const title = product.name.toLowerCase();
  if (title.includes('diaper') || title.includes('nappies')) return 'diapers';
  if (title.includes('hair dryer')) return 'dryer';
  if (title.includes('clipper') || title.includes('trimmer')) return 'clipper';
  if (title.includes('hand blender')) return 'blender';
  if (title.includes('whisk')) return 'whisk';
  return 'mixer';
}

function Illustration({ kind }: { kind: VisualKind }) {
  return <svg className="product-illustration" viewBox="0 0 280 220" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="197" rx="88" ry="9" fill="#173e32" opacity=".09" />
    {kind === 'mixer' && <>
      <path d="M77 167h126v16H77z" fill="#173e32" /><path d="M97 159h85l-13 16h-62z" fill="#52796b" />
      <path d="M86 107h88v13c0 31-15 47-44 47s-44-16-44-47z" fill="#f9faf5" stroke="#33564a" strokeWidth="4" />
      <path d="M93 127h74" stroke="#c2cac2" strokeWidth="3" />
      <path d="M184 57h18c13 0 19 7 19 19v94h-17V81c0-5-2-7-7-7h-13z" fill="#33564a" />
      <path d="M62 45c0-13 11-23 24-23h100c15 0 25 12 25 25v20H62z" fill="#304d43" />
      <path d="M82 34h94" stroke="#93a99d" strokeWidth="5" strokeLinecap="round" />
      <path d="M112 68v38m42-38v38" stroke="#80998c" strokeWidth="5" strokeLinecap="round" />
    </>}
    {kind === 'whisk' && <>
      <path d="M88 52c0-15 11-26 25-26h55c14 0 25 11 25 26v61H88z" fill="#304d43" />
      <path d="M106 40h69M120 113v31m40-31v31" stroke="#829b8e" strokeWidth="5" strokeLinecap="round" />
      <path d="M104 145c0 23 7 39 16 39s16-16 16-39m8 0c0 23 7 39 16 39s16-16 16-39" stroke="#33564a" strokeWidth="4" />
      <path d="M89 62h103" stroke="#8ba498" strokeWidth="3" />
    </>}
    {kind === 'blender' && <>
      <path d="M116 25h48l-5 71h-38z" fill="#304d43" /><path d="M121 95h38l-8 48h-22z" fill="#80998c" />
      <path d="M139 143v30m-25 9h50m-25-9-24 9m24-9 24 9" stroke="#33564a" strokeWidth="6" strokeLinecap="round" />
      <path d="M126 39h28m-28 10h28" stroke="#a5b7a9" strokeWidth="3" strokeLinecap="round" />
    </>}
    {kind === 'clipper' && <>
      <path d="M106 60h68l-6 111c-1 11-9 17-18 17h-20c-9 0-17-6-18-17z" fill="#304d43" />
      <path d="M114 46h52v19h-52z" fill="#80998c" /><path d="M112 30h56v18h-56z" fill="#33564a" />
      <path d="M117 23v14m9-14v14m9-14v14m9-14v14m9-14v14m9-14v14" stroke="#80998c" strokeWidth="5" />
      <path d="M121 85h38m-38 9h38" stroke="#90a99b" strokeWidth="3" strokeLinecap="round" />
    </>}
    {kind === 'dryer' && <>
      <path d="M56 60h135c20 0 34 14 34 32s-14 32-34 32H56z" fill="#304d43" />
      <path d="M190 68h37v48h-37z" fill="#80998c" /><path d="M98 124h52l-11 62h-34z" fill="#33564a" />
      <path d="M69 74v36m12-36v36m12-36v36" stroke="#8da99b" strokeWidth="4" strokeLinecap="round" />
      <path d="M110 139h31" stroke="#91a99b" strokeWidth="4" strokeLinecap="round" />
    </>}
    {kind === 'diapers' && <>
      <rect x="72" y="35" width="136" height="146" rx="14" fill="#f9faf5" stroke="#33564a" strokeWidth="4" />
      <path d="M73 65h134v52H73z" fill="#8cae9e" /><path d="M93 130c19-22 31-18 47-7 16-11 28-15 47 7l-16 35h-62z" fill="#dbe6dc" stroke="#33564a" strokeWidth="3" />
      <path d="M111 84h58m-38 11h18" stroke="#f9faf5" strokeWidth="5" strokeLinecap="round" />
    </>}
  </svg>;
}

export default function ProductVisual({ product, large = false }: { product: Product; large?: boolean }) {
  const [failedImage, setFailedImage] = useState('');
  const hasPhoto = Boolean(product.image && failedImage !== product.image);
  return <span className={`product-visual${large ? ' large' : ''}`}>
    <Illustration kind={kindFor(product)} />
    <span className="product-visual-caption"><small>{hasPhoto ? 'Product photo' : 'Product illustration'}</small><strong>{product.brand}</strong><em>{product.model}</em></span>
    {hasPhoto && <img className="product-photo" src={product.image} alt={product.name} loading={large ? 'eager' : 'lazy'} decoding="async" fetchPriority={large ? 'high' : 'auto'} draggable={false} onError={() => setFailedImage(product.image)} />}
  </span>;
}
