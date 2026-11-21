import Redis from 'ioredis';
import { Hotel, SupplierHotel } from '../types';
import { REDIS_URL, SUPPLIER_BASE_URL } from '../config';

const redis = new Redis(REDIS_URL);
const hotelsKey = (city: string) => `hotels:${city.toLowerCase()}`;

// Supplier API call -> normalized Hotel[]
export async function fetchSupplier(supplier: 'A' | 'B', city: string): Promise<Hotel[]> {
  const url = `${SUPPLIER_BASE_URL}/supplier${supplier}/hotels?city=${encodeURIComponent(city)}`;
  console.log(`[activity] fetching ${url}`);
    let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    console.error(`[activity] Supplier ${supplier} unreachable: ${String(err)}`);
    throw err;
  }
  if (!res.ok) throw new Error(`Supplier ${supplier} responded ${res.status}`);
  const data = (await res.json()) as SupplierHotel[];
  return data.map((h) => ({
    name: h.name,
    price: h.price,
    supplier: `Supplier ${supplier}`,
    commissionPct: h.commissionPct,
  }));
}

// Redis ZSET: score = price, member = JSON of hotel
export async function saveHotelsToRedis(city: string, hotels: Hotel[]): Promise<void> {
  const key = hotelsKey(city);
  const pipeline = redis.multi().del(key);
  for (const h of hotels) pipeline.zadd(key, h.price, JSON.stringify(h));
  if (hotels.length) pipeline.expire(key, 3600);
  await pipeline.exec();
  console.log(`[activity] saved ${hotels.length} hotels in ${key}`);
}

// Price filtering INSIDE Redis (ZRANGEBYSCORE)
export async function filterHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<Hotel[]> {
  const min = minPrice ?? '-inf';
  const max = maxPrice ?? '+inf';
  const rows = await redis.zrangebyscore(hotelsKey(city), min, max);
  return rows.map((r) => JSON.parse(r) as Hotel);
}