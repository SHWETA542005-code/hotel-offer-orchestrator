import express from 'express';
import { Client, Connection } from '@temporalio/client';
import { randomUUID } from 'crypto';
import { supplierRouter } from './mock/suppliers';
import type { hotelOfferWorkflow } from './temporal/workflows';
import { SUPPLIER_BASE_URL, TASK_QUEUE, TEMPORAL_ADDRESS } from './config';

const app = express();
app.use(supplierRouter); // mock supplier endpoints
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
  next();
});

app.get('/health', async (_req, res) => {
  const check = async (s: 'A' | 'B') => {
    try {
      const r = await fetch(`${SUPPLIER_BASE_URL}/supplier${s}/hotels?city=delhi`, {
        signal: AbortSignal.timeout(2000),
      });
      return r.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  };
  const [a, b] = await Promise.all([check('A'), check('B')]);
  const healthy = a === 'up' && b === 'up';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    suppliers: { supplierA: a, supplierB: b },
  });
});

let client: Client;
async function getClient(): Promise<Client> {
  if (!client) {
    const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
    client = new Client({ connection });
  }
  return client;
}

const parsePrice = (v: unknown): number | undefined | null => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null; // null = invalid
};

app.get('/api/hotels', async (req, res) => {
  const city = String(req.query.city ?? '').trim().toLowerCase();
  if (!city) return res.status(400).json({ error: 'city query param is required' });

  const minPrice = parsePrice(req.query.minPrice);
  const maxPrice = parsePrice(req.query.maxPrice);
  if (minPrice === null || maxPrice === null) {
    return res.status(400).json({ error: 'minPrice/maxPrice must be non-negative numbers' });
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return res.status(400).json({ error: 'minPrice cannot be greater than maxPrice' });
  }

  try {
    const c = await getClient();
    const hotels = await c.workflow.execute<typeof hotelOfferWorkflow>('hotelOfferWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId: `hotels-${city}-${randomUUID()}`,
      args: [{ city, minPrice, maxPrice }],
    });
    return res.json(hotels);
  } catch (err) {
    console.error('[api] workflow failed', err);
    return res.status(500).json({ error: 'Failed to fetch hotels' });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));