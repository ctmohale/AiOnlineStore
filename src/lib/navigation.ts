export const isStoreNavigationActive = (pathname: string, selectedCategory: string, targetCategory?: string) => {
  if (pathname !== '/shop') return false;
  return targetCategory ? selectedCategory === targetCategory : selectedCategory === '';
};
