describe('live store catalogue', () => {
  it('shows an honest empty state when the database has no published products', () => {
    cy.intercept('GET', '**/api/products', []);
    cy.intercept('GET', '**/api/store-settings', { freeDeliveryThreshold: 999, standardCustomerDelivery: 89 });
    cy.visit('/shop');
    cy.contains('No products published yet');
    cy.contains('Verified products added in Admin will appear here.');
  });
});
