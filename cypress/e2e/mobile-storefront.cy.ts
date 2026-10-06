const products = Array.from({ length: 8 }, (_, index) => ({
  id: 200 + index,
  slug: `mobile-product-${index + 1}`,
  title: index === 0 ? 'Hisense Smart QLED Television' : `Mobile catalogue product ${index + 1}`,
  brand: index === 0 ? 'Hisense' : 'Mzansi',
  model: `MOBILE-${index + 1}`,
  pack_size: '1 unit',
  category: index % 2 ? 'Home Appliances' : 'Electronics & Computing',
  description: 'A responsive storefront test product with useful product details.',
  specifications: { Warranty: '12 months' },
  selling_price: 499 + index * 250,
  original_displayed_price: index % 2 ? 699 + index * 250 : null,
  image_url: null,
  units_sold: 20 - index,
}));

describe('mobile storefront layout', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    cy.intercept('GET', '**/api/products', products);
    cy.intercept('GET', '**/api/store-settings', { freeDeliveryThreshold: 650, standardCustomerDelivery: 89 });
  });

  const expectNoHorizontalOverflow = () => {
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth + 1);
    });
  };

  it('keeps the mobile header, homepage and product grid within the viewport', () => {
    cy.visit('/');
    cy.get('.header-search').should('be.visible');
    cy.get('.retail-hero').should('be.visible');
    cy.get('.retail-product-grid .product-card').should('have.length.greaterThan', 1);
    expectNoHorizontalOverflow();
  });

  it('uses a compact filter drawer and two-column catalogue', () => {
    cy.visit('/shop');
    cy.get('.mobile-filter-toggle').should('be.visible').and('have.attr', 'aria-expanded', 'false');
    cy.get('.shop-filter-panel').should('not.be.visible');
    cy.get('.mobile-filter-toggle').click();
    cy.get('.shop-filter-panel').should('be.visible');
    cy.get('.mobile-filter-toggle').click();
    cy.get('.shop-product-grid .product-card').should('have.length.greaterThan', 1).then(($cards) => {
      const first = $cards[0].getBoundingClientRect();
      const second = $cards[1].getBoundingClientRect();
      expect(Math.abs(first.top - second.top)).to.be.lessThan(2);
      expect(first.width).to.be.greaterThan(150);
    });
    expectNoHorizontalOverflow();
  });

  it('keeps catalogue search visible while products are scrolling', () => {
    cy.visit('/shop');
    cy.get('.shop-product-grid').scrollIntoView();
    cy.scrollTo('bottom', { duration: 0 });
    cy.get('.shop-results-toolbar').should('be.visible').then(($toolbar) => {
      expect($toolbar[0].getBoundingClientRect().top).to.be.closeTo(104, 3);
    });
    cy.get('.shop-results-toolbar input[aria-label="Search products"]').should('be.visible').type('Hisense');
    cy.contains('Hisense Smart QLED Television').should('be.visible');
  });

  it('keeps product and cart actions usable on a narrow screen', () => {
    cy.visit('/product/mobile-product-1');
    cy.contains('Hisense Smart QLED Television').should('be.visible');
    cy.get('.product-gallery').then(($gallery) => cy.get('.detail-copy').then(($copy) => {
      expect($copy[0].getBoundingClientRect().top).to.be.greaterThan($gallery[0].getBoundingClientRect().bottom - 1);
    }));
    cy.get('.product-share .share-actions').should('be.visible');
    expectNoHorizontalOverflow();
    cy.contains('Add to cart').should('be.visible').click();
    cy.url().should('include', '/cart');
    cy.get('.cart-line').should('be.visible');
    cy.get('.order-summary').should('be.visible');
    expectNoHorizontalOverflow();
  });
});
