import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicRequest } from '../lib/api';
import { loadPublicCatalogue } from './catalogueLoader';

vi.mock('../lib/api', () => ({ publicRequest: vi.fn() }));

describe('public catalogue pagination', () => {
  beforeEach(() => vi.mocked(publicRequest).mockReset());

  it('loads every page and removes duplicates defensively', async () => {
    const firstPage = Array.from({ length: 3000 }, (_, id) => ({ id: id + 1 }));
    vi.mocked(publicRequest)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: 3000 }, { id: 3001 }]);

    const products = await loadPublicCatalogue();

    expect(products).toHaveLength(3001);
    expect(publicRequest).toHaveBeenNthCalledWith(1, '/products');
    expect(publicRequest).toHaveBeenNthCalledWith(2, '/products?offset=3000');
  });

  it('rejects a repeated full page instead of looping forever', async () => {
    const page = Array.from({ length: 3000 }, (_, id) => ({ id: id + 1 }));
    vi.mocked(publicRequest).mockResolvedValue(page);

    await expect(loadPublicCatalogue()).rejects.toThrow('could not finish loading');
  });
});
