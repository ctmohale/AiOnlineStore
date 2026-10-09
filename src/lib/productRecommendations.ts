import type { Product } from '../data/products';

const normalise = (value: string) => value.trim().toLocaleLowerCase('en-ZA');

export function relatedProductsFor(current: Product, products: Product[], limit = 4) {
  const category = normalise(current.category);
  const brand = normalise(current.brand);

  return products
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      const sameCategory = Boolean(category) && normalise(candidate.category) === category;
      const sameBrand = Boolean(brand) && normalise(candidate.brand) === brand;
      if (!sameCategory && !sameBrand) return null;
      const popularity = Number(candidate.trendingUnits || 0) * 3 + Number(candidate.recentUnits || 0) * 2 + Number(candidate.unitsSold || 0);
      return { candidate, score: (sameCategory ? 100 : 0) + (sameBrand ? 35 : 0) + popularity };
    })
    .filter((item): item is { candidate: Product; score: number } => item !== null)
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, 'en-ZA'))
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
