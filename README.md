# Moya Market MVP

A launch-focused South African reseller storefront and operations dashboard. Customers request an order first; staff verify the exact supplier product, live checkout price, stock, and delivery before sending a manual card-payment link.

## What is included

- Responsive React storefront with search, category filtering, product detail, persistent cart, guest request form, optional customer registration/login, customer order history, delivery threshold, and confirmation reference.
- Operations dashboard with full product CRUD (create, list, edit, and safe archive), optional image URLs, product states, review alerts, order statuses, quote costs, profit/margin visibility, and configurable guardrails.
- Express API with Zod validation, parameterized MySQL queries, bcrypt passwords, JWT admin authorization, Helmet, CORS, and public rate limits.
- MySQL migrations covering admins, customers, products, images, supplier offers, price history, ingestion runs, orders/items, payment references, and pricing settings.
- CSV and permitted JSON-feed adapters, exact-product deduplication, review-only ingestion, daily retailer URL and stale checks, and hourly promotion-end checks.
- Domain tests for profit, free delivery, expiry, staleness, exact matching, and locked order prices.

The product catalogue starts empty. The seed command creates or updates only the production administrator; real products must be added, verified, and published through the admin sourcing workflow. Product images remain optional URLs and the UI displays placeholders until rights-cleared image URLs are supplied.

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

Sign in at `/admin/login`, open **Products**, and choose **Add product**. Paste a public Game or Makro product URL to prefill available structured metadata, then review it before saving. The workflow stores product identity, supplier and promotion details, fulfilment costs, verification timestamps, confidence, price history, and internal notes. Images remain optional URLs; the app does not generate or upload product imagery.

Drafts can be incomplete. Publication requires a name, category, exact model or pack size, supplier URL, verified supplier price, current check time, usable stock status, and a profit estimate that passes the configured product and margin guardrails. Supplier price, source URL, margin, and internal notes are never included in public catalogue responses. The database-configured free-delivery threshold is applied to the complete cart, and estimated costs and profit are recalculated when the order request is created.

The daily worker rechecks the latest public Game or Makro URL when no promotion end date was supplied. If the supplier price changes, the price is marked unverified and the product returns to pending review; an unavailable item is paused. Failed or incomplete public metadata is recorded for staff follow-up and never silently overwrites a verified price.

Without `DATABASE_URL`, health reports degraded and data-changing requests return 503. The storefront and dashboard never substitute preview products, orders, credentials, prices, or metrics for unavailable database data.

## Commands

| Service | Development | Build | Production start |
|---|---|---|---|
| Web | `npm run dev` | `npm run build:web` | static `dist/` output |
| API | `npm run dev:api` | `npm run build:api` | `npm run start:api` |
| Worker | `npm run dev:worker` | `npm run build:api` | `npm run start:worker` |

Other commands: `npm test`, `npm run lint`, `npm run db:migrate`, `npm run db:seed`, and `npm run worker:import-csv -- /path/to/authorised-products.csv`.

## Railway deployment

Create one Railway project with a MySQL service and three services pointing to this repository:

1. **web** — build `npm ci && npm run build:web`; deploy `dist/` with Railway's static hosting or `npx serve -s dist -l $PORT`. Set `VITE_API_URL` to the public API URL before building.
2. **api** — build `npm ci && npm run build:api`; pre-deploy `npm run db:migrate`; start `npm run start:api`. Healthcheck path is `/health`.
3. **worker** — build `npm ci && npm run build:api`; start `npm run start:worker`. Do not expose a public domain.

Reference Railway's MySQL `DATABASE_URL` into both API and worker. Add `JWT_SECRET`, `FRONTEND_URL`, pricing values, admin seed credentials, and optionally a permitted `RETAILER_FEED_URL`. Run `npm run db:seed` once from the API service shell, then remove `ADMIN_PASSWORD` if operational policy requires it.

## Launch boundaries

Still required before real trading:

- verified, permitted retailer feed/API details (the code does not bypass access controls or scrape protected pages);
- retailer URL import is a review aid that reads public structured page metadata only; blocked or incomplete listings must be entered manually;
- human verification and publication of initial offers, descriptions, and rights-cleared product image URLs;
- real delivery rates and packaging costs;
- a configured Yoco or Paystack merchant account and payment-webhook verification if payment confirmation is to be automated;
- transactional email/WhatsApp delivery for quotes and status updates;
- final legal/privacy/returns copy and an admin session-hardening review (for example, moving the MVP bearer token from session storage to secure HTTP-only cookies).

See [API documentation](docs/API.md) for request details.
