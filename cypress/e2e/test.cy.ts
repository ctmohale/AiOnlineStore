describe('live store catalogue', () => {
  it('shows an honest empty state when the database has no published products', () => {
    cy.intercept('GET', '**/api/products', []);
    cy.intercept('GET', '**/api/store-settings', { freeDeliveryThreshold: 999, standardCustomerDelivery: 89 });
    cy.visit('/shop');
    cy.contains('No products published yet');
    cy.contains('Verified products added in Admin will appear here.');
  });

  it('completes browse, multi-image product view, cart and order request', () => {
    const product = { id: 77, slug: 'gallery-kettle', title: 'Gallery Kettle', brand: 'Acme', model: 'GK-1', pack_size: '1 unit', category: 'Appliances', description: 'A complete product.', specifications: { Capacity: '1.7L' }, selling_price: 599, original_displayed_price: 699, image_url: 'https://images.example.test/front.jpg', images: [{ url: 'https://images.example.test/front.jpg', alt_text: 'Kettle front', sort_order: 0 }, { url: 'https://images.example.test/side.jpg', alt_text: 'Kettle side', sort_order: 1 }] };
    cy.intercept('GET', '**/api/products', [product]);
    cy.intercept('GET', '**/api/store-settings', { freeDeliveryThreshold: 500, standardCustomerDelivery: 89 });
    cy.intercept('POST', '**/api/orders', { statusCode: 201, body: { reference: 'MY-E2E-001' } }).as('order');
    cy.visit('/shop');
    cy.contains('Gallery Kettle').click();
    cy.contains('1 / 2');
    cy.get('button[aria-label="View product image 2"]').click();
    cy.contains('2 / 2');
    cy.get('button[aria-label="Open full-size product image"]').click();
    cy.get('[role="dialog"][aria-label="Full-size product image"]').should('be.visible');
    cy.get('button[aria-label="Close full-size image"]').click();
    cy.contains('Add to cart').click();
    cy.contains('Free');
    cy.contains('Request this order').click();
    cy.get('input[name=name]').type('E2E Customer');
    cy.get('input[name=phone]').type('082 123 4567');
    cy.get('input[name=email]').type('e2e@example.test');
    cy.get('input[name=addressLine1]').type('1 Test Street');
    cy.get('input[name=suburb]').type('Sandton');
    cy.get('input[name=city]').type('Johannesburg');
    cy.get('select[name=province]').select('Gauteng');
    cy.get('input[name=postalCode]').type('2000');
    cy.contains('Send order request').click();
    cy.contains('Send request').click();
    cy.wait('@order').its('request.body.items.0.productId').should('equal', 77);
    cy.url().should('include', '/confirmation/MY-E2E-001');
  });
});
