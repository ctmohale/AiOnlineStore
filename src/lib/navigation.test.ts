import { describe, expect, it } from 'vitest';
import { isStoreNavigationActive } from './navigation';

describe('store navigation selection', () => {
  it('highlights Shop only when no category is selected', () => {
    expect(isStoreNavigationActive('/shop', '')).toBe(true);
    expect(isStoreNavigationActive('/shop', 'Baby')).toBe(false);
  });

  it('highlights only the matching selected category', () => {
    expect(isStoreNavigationActive('/shop', 'Baby', 'Baby')).toBe(true);
    expect(isStoreNavigationActive('/shop', 'Baby', 'Grooming')).toBe(false);
    expect(isStoreNavigationActive('/', 'Baby', 'Baby')).toBe(false);
  });
});
