import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('request-first catalogue visibility policy', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'server', 'app.ts'), 'utf8');
  const workerSource = fs.readFileSync(path.join(process.cwd(), 'worker', 'index.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(process.cwd(), 'server', 'db', 'migrations', '020_restore_browsable_catalogue.sql'), 'utf8');

  it('keeps stale but otherwise valid products browsable for supplier confirmation', () => {
    const publicProductsRoute = appSource.slice(appSource.indexOf("app.get('/api/products'"), appSource.indexOf("app.get('/api/seo/sitemap'"));
    expect(publicProductsRoute).toContain('supplier_check_required');
    expect(publicProductsRoute).not.toContain("'o.last_checked_at >= DATE_SUB");
  });

  it('restores only products paused for supplier-data age', () => {
    expect(migration).toContain("p.review_reason='supplier_data_stale'");
    expect(migration).toContain("o.stock_status IN ('in_stock','low_stock')");
    expect(migration).toContain('o.price_verified=TRUE');
    expect(migration).toContain("p.status='published'");
  });

  it('refreshes frequently without pausing a product solely because of age', () => {
    expect(workerSource).toContain("process.env.WORKER_CRON || '0 * * * *'");
    const hardPause = workerSource.match(/UPDATE products p JOIN supplier_offers o[\s\S]*?SET p\.status='paused'[\s\S]*?\)"\);/)?.[0] || '';
    expect(hardPause).not.toContain('o.last_checked_at<');
  });
});
