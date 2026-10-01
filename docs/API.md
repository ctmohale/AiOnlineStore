# Mzansi Mega Store REST API

Base URL: `/api`. JSON is used for requests and responses. Admin routes require `Authorization: Bearer <token>`.

## Public

- `GET /health` — application and database status.
- `GET /api/products?q=&category=` — fresh, in-stock, published products only. Supplier costs are never selected.
- `GET /api/store-settings` — public cart delivery threshold and standard delivery charge from the live pricing-settings row.
- `POST /api/orders` — create a guest order request. Limited to 30 requests per IP per 15 minutes. The server ignores client prices and locks the current server-side selling price into each order-item snapshot.
- `POST /api/customer/register` — create a customer account and return a 30-day customer token.
- `POST /api/customer/login` — customer email/password login.
- `GET /api/customer/me` — authenticated customer profile.
- `GET /api/customer/orders` — authenticated customer's own order-request history only.

Guest checkout remains available. When a valid customer bearer token accompanies an order request, the order is linked to that customer account automatically.

Order body:

```json
{
  "customer": {
    "name": "Nomsa Dlamini",
    "email": "nomsa@example.com",
    "phone": "082 123 4567",
    "addressLine1": "10 Main Road",
    "suburb": "Rosebank",
    "city": "Johannesburg",
    "province": "Gauteng",
    "postalCode": "2196",
    "notes": "Call at the gate"
  },
  "items": [{ "productId": 1, "quantity": 1 }]
}
```

## Admin

- `POST /api/admin/login` — email/password sign-in; returns an 8-hour JWT. Limited to 10 attempts per IP per 15 minutes.
- `GET /api/admin/me` — current authenticated administrator profile used by the dashboard.
- `GET /api/admin/review-queue` — changed, expired, stale, unavailable, and uncertain products.
- `GET /api/admin/products` — list the active admin catalogue, including the primary image and latest offer summary.
- `POST /api/admin/products/import-url` — read public structured metadata from an allowlisted Game or Makro HTTPS product URL and return a review draft; it never saves or verifies the result automatically.
- `POST /api/admin/products` — create a product and its latest supplier sourcing record, optional primary image URL, fulfilment estimates, tracking fields, and initial price-history record.
- `GET /api/admin/products/:id` — read one product together with its supplier offers.
- `PATCH /api/admin/products/:id` — update product, supplier, promotion, fulfilment, tracking, selling-price, status, or primary-image data. Publication is rejected until required verification and profit guardrails pass.
- `DELETE /api/admin/products/:id` — safely archive a product and remove it from the public catalogue while preserving history.
- `POST /api/admin/products/:id/restore` — restore an archived product as a draft that requires supplier verification.
- `GET /api/admin/products/:id/offers` — read complete supplier-offer details for a product.
- `PATCH /api/admin/products/:id/review` — change price/state, persist price history, and enforce freshness, stock, promotion, profit, and margin rules before publication.
- `GET|PATCH /api/admin/pricing-settings` — read or update the global profit, margin, delivery, and staleness guardrails.
- `GET /api/admin/orders` — most recent order requests.
- `PATCH /api/admin/orders/:id/status` — controlled status transitions; deliberately refuses to mark an order paid.
- `PATCH /api/admin/orders/:id/quote` — records real supplier/product/delivery/packaging/payment/advertising costs, calculates expected profit, and rejects quotes below configured thresholds.
- `POST /api/admin/orders/:id/payment-link` — stores a manually-created Yoco/Paystack link and moves a quoted order to `awaiting_payment`.
- `PATCH /api/admin/orders/:id/confirm-payment` — explicitly verifies a matching payment reference and only then marks the order paid. Customer return URLs never change payment state.

Validation errors return HTTP 400, stale/unavailable product conflicts return 409, pricing-rule failures return 422, and unauthenticated admin requests return 401.
