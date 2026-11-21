# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two mock suppliers, de-duplicates hotels by name, keeps the cheapest offer per hotel, stores the result in Redis and supports price-range filtering inside Redis.

**Stack:** Node.js (TypeScript), Express, Temporal, Redis, Docker Compose

## Architecture

```
Client ──GET /api/hotels──▶ Express API ──starts──▶ Temporal Workflow (hotelOfferWorkflow)
                                                      │
                          ┌───────────────────────────┤ 1. fetchSupplier(A) ┐ parallel
                          │                           │ 2. fetchSupplier(B) ┘ (Promise.allSettled)
                          │                           │ 3. dedupe by name, keep cheaper
                          │                           │ 4. saveHotelsToRedis  (ZSET, score = price)
                          │                           │ 5. filterHotelsFromRedis (ZRANGEBYSCORE)
                          ▼                           ▼
                 Mock Supplier A/B endpoints        Redis
```

- **Workflow** (`src/temporal/workflows.ts`) only orchestrates. All I/O happens in **activities** (`src/temporal/activities.ts`), which Temporal retries (3 attempts).
- **Redis storage:** one sorted set per city (`hotels:<city>`), score = price, member = hotel JSON. Price filtering is a single `ZRANGEBYSCORE key min max` call, so filtering happens inside Redis. Keys expire after 1 hour.
- **Resilience:** if one supplier is down, the workflow logs a warning and continues with the other supplier's results.
- **Dedupe rule:** hotel names are compared case-insensitively (trimmed). Cheaper price wins; if only one supplier has the hotel it is used as is.

## Project structure

```
src/
  config.ts              env-based config
  types.ts               shared types
  mock/suppliers.ts      mock Supplier A/B endpoints (+ down/up simulation)
  temporal/workflows.ts  workflow
  temporal/activities.ts activities (HTTP + Redis)
  worker.ts              Temporal worker
  server.ts              Express API + /health
Dockerfile
docker-compose.yml
Hotel-Offer-Orchestrator.postman_collection.json
```

## Run with Docker (recommended)

Prerequisite: Docker Desktop (or Docker Engine + Compose).

```bash
git clone <your-repo-url>
cd hotel-offer-orchestrator
docker compose up --build
```

This starts: `redis`, `temporal` (dev server + UI), `app` (API + mock suppliers) and `worker`.
The worker may restart once or twice while Temporal is starting up; this is expected (`restart: on-failure`).

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Temporal Web UI | http://localhost:8233 |

Stop everything: `docker compose down`

## Run locally (without Docker for the app)

Requires Node 18+, a running Redis (`localhost:6379`) and Temporal (`temporal server start-dev`).

```bash
npm install
npm run dev      # terminal 1: API
npm run worker   # terminal 2: worker
```

Environment variables (all optional, defaults shown):

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `TEMPORAL_ADDRESS` | `localhost:7233` |
| `REDIS_URL` | `redis://localhost:6379` |
| `SUPPLIER_BASE_URL` | `http://localhost:3000` |

## API

### `GET /api/hotels?city=<city>[&minPrice=<n>][&maxPrice=<n>]`

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=6000"
```

Response (sorted by price ascending):

```json
[
  { "name": "Holtin",  "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

| Case | Result |
|---|---|
| Unknown city | `200 []` |
| Missing `city` | `400` |
| Non-numeric / negative price, or `minPrice > maxPrice` | `400` |
| Workflow failure | `500` |

### `GET /health`

Checks both mock suppliers. `200` when both are up, `503` (`"status": "degraded"`) otherwise.

```json
{ "status": "ok", "suppliers": { "supplierA": "up", "supplierB": "up" } }
```

### Mock suppliers

- `GET /supplierA/hotels[?city=delhi]`
- `GET /supplierB/hotels[?city=delhi]`

Cities in mock data: `delhi`, `mumbai`. Hotel names overlap between suppliers (Holtin, Radison, Taj Palace).

### Supplier-down simulation

```bash
curl -X POST http://localhost:3000/mock/supplier/A/down   # Supplier A starts returning 503
curl -X POST http://localhost:3000/mock/supplier/A/up     # restore
```

## Postman

Import `Hotel-Offer-Orchestrator.postman_collection.json` (variable `baseUrl` defaults to `http://localhost:3000`). It covers:

1. Health check
2. Valid city with overlaps (`delhi`)
3. Price range filter, and min-only filter
4. City with no results (`paris`)
5. Validation errors (missing city, `minPrice > maxPrice`)
6. Supplier-down simulation folder (run in order 8a → 8d)

Run the whole collection with the Postman Collection Runner; every request has test assertions.

## Logging & error handling

- Express request logging (`METHOD url status duration`).
- Activities log supplier calls, timeouts (5s) and Redis writes; Temporal retries failed activities (3 attempts, 500ms initial backoff).
- Workflow logs a warning when a supplier fails and continues with the remaining supplier.
- Every workflow run is visible in the Temporal UI at http://localhost:8233.