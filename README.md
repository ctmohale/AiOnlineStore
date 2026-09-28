# Moya Market MVP

A launch-focused South African reseller storefront and operations dashboard. Customers request an order first; staff verify the exact supplier product, live checkout price, stock, and delivery before sending a manual card-payment link.

## What is included

- Responsive React storefront with search, category filtering, product detail, persistent cart, guest request form, optional customer registration/login, customer order history, delivery threshold, and confirmation reference.
- Operations dashboard with full product CRUD (create, list, edit, and safe archive), optional image URLs, product states, review alerts, order statuses, quote costs, profit/margin visibility, and configurable guardrails.
- Express API with Zod validation, parameterized MySQL queries, bcrypt passwords, JWT admin authorization, Helmet, CORS, and public rate limits.
- MySQL migrations covering admins, customers, products, images, supplier offers, price history, ingestion runs, orders/items, payment references, and pricing settings.
- CSV and permitted JSON-feed adapters, exact-product deduplication, review-only ingestion, daily stale checks, and hourly promotion-end checks.
- Domain tests for profit, free delivery, expiry, staleness, exact matching, and locked order prices.

The three initial products are demo catalogue examples. Database seeds mark them `pending_review`; they cannot be published until a person verifies the supplier offer. Product image fields are intentionally empty and the UI displays placeholders until rights-cleared image URLs are supplied.

## Local setup

Requires Node.js 22+ and MySQL 8+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev:api
```

In a second terminal run `npm run dev`, then open `http://localhost:5173`. Run the worker with `npm run worker:once`, or keep its schedules active with `npm run dev:worker`.

Sign in at `/admin/login`, open **Products**, and choose **Add product**. New catalogue items are saved as drafts and remain off the public storefront until a current supplier offer passes the existing review and pricing guardrails. Images are optional URLs; the app does not generate or upload product imagery.

Without `DATABASE_URL`, the API deliberately starts in a development-only degraded mode so the UI and request flow can be reviewed. Production health returns 503 if MySQL is missing. The dashboard login uses the API in production; only Vite development mode permits the prefilled local preview credentials when the API is unavailable.

## Commands

| Service | Development | Build | Production start |
|---|---|---|---|
| Web | `npm run dev` | `npm run build:web` | static `dist/` output |
| API | `npm run dev:api` | `npm run build:api` | `npm run start:api` |
| Worker | `npm run dev:worker` | `npm run build:api` | `npm run start:worker` |

Other commands: `npm test`, `npm run lint`, `npm run db:migrate`, `npm run db:seed`, and `npm run worker:import-csv -- ./examples/products.csv`.

## Railway deployment

Create one Railway project with a MySQL service and three services pointing to this repository:

1. **web** — build `npm ci && npm run build:web`; deploy `dist/` with Railway's static hosting or `npx serve -s dist -l $PORT`. Set `VITE_API_URL` to the public API URL before building.
2. **api** — build `npm ci && npm run build:api`; pre-deploy `npm run db:migrate`; start `npm run start:api`. Healthcheck path is `/health`.
3. **worker** — build `npm ci && npm run build:api`; start `npm run start:worker`. Do not expose a public domain.

Reference Railway's MySQL `DATABASE_URL` into both API and worker. Add `JWT_SECRET`, `FRONTEND_URL`, pricing values, admin seed credentials, and optionally a permitted `RETAILER_FEED_URL`. Run `npm run db:seed` once from the API service shell, then remove `ADMIN_PASSWORD` if operational policy requires it.

## Launch boundaries

Still required before real trading:

- verified, permitted retailer feed/API details (the code does not bypass access controls or scrape protected pages);
- human verification and publication of initial offers, descriptions, and rights-cleared product image URLs;
- real delivery rates and packaging costs;
- a configured Yoco or Paystack merchant account and payment-webhook verification if payment confirmation is to be automated;
- transactional email/WhatsApp delivery for quotes and status updates;
- final legal/privacy/returns copy and an admin session-hardening review (for example, moving the MVP bearer token from session storage to secure HTTP-only cookies).

See [API documentation](docs/API.md) for request details.
