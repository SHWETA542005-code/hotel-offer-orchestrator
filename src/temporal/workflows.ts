import { log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type { Hotel } from '../types';

const { fetchSupplier, saveHotelsToRedis, filterHotelsFromRedis } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 seconds',
    retry: { maximumAttempts: 3 },
  });

export interface HotelWorkflowInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

function dedupeCheapest(hotels: Hotel[]): Hotel[] {
  const best = new Map<string, Hotel>();
  for (const h of hotels) {
    const key = h.name.trim().toLowerCase();
    const current = best.get(key);
    if (!current || h.price < current.price) best.set(key, h);
  }
  return [...best.values()];
}

export async function hotelOfferWorkflow(input: HotelWorkflowInput): Promise<Hotel[]> {
  const { city, minPrice, maxPrice } = input;

  // Supplier A & B parallel; ek down ho to dusre ka result use hoga
  const results = await Promise.allSettled([
    fetchSupplier('A', city),
    fetchSupplier('B', city),
  ]);
    results.forEach((r, i) => {
    if (r.status === 'rejected') {
      log.warn(`Supplier ${i === 0 ? 'A' : 'B'} failed, continuing with the other`, { error: String(r.reason) });
    }
  });
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  const deduped = dedupeCheapest(all);
  await saveHotelsToRedis(city, deduped);
  return filterHotelsFromRedis(city, minPrice, maxPrice);
}