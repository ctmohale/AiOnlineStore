import { describe, expect, it } from 'vitest';
import { parseProductCsv, parseProductXlsx, productsToCsv, productsToXlsx } from './product-catalogue-files.js';

describe('product catalogue files', () => {
  it('round-trips all editable product, supplier, specification and image fields', () => {
    const csv = productsToCsv([{
      id: 12, slug: 'test-kettle-a1', title: 'Test, Kettle', brand: 'Acme', model: 'KT-100', barcode: '1234', pack_size: '1 unit',
      category: 'Appliances', description: 'Two lines\nof detail', specifications: { Colour: 'Red', Power: '2 kW' }, selling_price: 499.95,
      minimum_profit: 20, estimated_customer_delivery_cost: 89, delivery_time: '2-4 days', item_weight_size: '2 kg', internal_review_notes: 'Checked',
      status: 'draft', review_reason: null, retailer: 'Game', source_url: 'https://www.game.co.za/product', supplier_sku: 'SUP-1', current_cost: 399.95,
      original_displayed_price: 599.95, supplier_delivery_cost: 0, stock_status: 'in_stock', fulfilment_type: 'online_only', fulfilment_signal: 'Online only',
      source_confidence: 'high', price_verified: 1, images: [{ url: 'https://example.com/front.jpg' }, { url: 'https://example.com/side.jpg' }],
    }]);
    const [row] = parseProductCsv(csv);
    expect(row.id).toBe(12);
    expect(row.input.title).toBe('Test, Kettle');
    expect(row.input.description).toBe('Two lines\nof detail');
    expect(row.input.specifications).toEqual({ Colour: 'Red', Power: '2 kW' });
    expect(row.imageUrls).toEqual(['https://example.com/front.jpg', 'https://example.com/side.jpg']);
    expect(row.input.supplier).toMatchObject({ retailer: 'Game', sourceUrl: 'https://www.game.co.za/product', currentCost: 399.95, supplierPriceVerified: true });
  });

  it('moves imported published rows back to pending review', () => {
    const csv = 'title,category,selling_price,status\nKettle,Appliances,499,published\n';
    const [row] = parseProductCsv(csv);
    expect(row.status).toBe('published');
    expect(row.input.status).toBe('pending_review');
  });

  it('creates a real Excel workbook that can be imported again', async () => {
    const workbook = await productsToXlsx([{ id: 7, title: 'Excel Kettle', category: 'Appliances', selling_price: 799, status: 'draft', specifications: {}, images: [] }]);
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    const [row] = await parseProductXlsx(workbook);
    expect(row).toMatchObject({ id: 7, status: 'draft' });
    expect(row.input).toMatchObject({ title: 'Excel Kettle', category: 'Appliances', sellingPrice: 799 });
  });

  it('reports the spreadsheet row when data is invalid', () => {
    expect(() => parseProductCsv('title,category,selling_price\nKettle,Appliances,not-a-price\n')).toThrow(/Row 2/);
  });
});
