import { Router, Request, Response } from 'express';
import { SupplierHotel } from '../types';

const supplierA: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin',      price: 6000, city: 'delhi',  commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison',     price: 5900, city: 'delhi',  commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace',  price: 9500, city: 'delhi',  commissionPct: 12 },
  { hotelId: 'a4', name: 'Lemon Tree',  price: 4200, city: 'delhi',  commissionPct: 15 },
  { hotelId: 'a5', name: 'Holtin',      price: 7100, city: 'mumbai', commissionPct: 10 },
];

const supplierB: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin',      price: 5340, city: 'delhi',  commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison',     price: 6100, city: 'delhi',  commissionPct: 11 },
  { hotelId: 'b3', name: 'Taj Palace',  price: 9800, city: 'delhi',  commissionPct: 9  },
  { hotelId: 'b4', name: 'Ginger',      price: 3100, city: 'delhi',  commissionPct: 18 },
  { hotelId: 'b5', name: 'Radison',     price: 6800, city: 'mumbai', commissionPct: 11 },
];

const down: Record<'A' | 'B', boolean> = { A: false, B: false };

const handler = (key: 'A' | 'B', data: SupplierHotel[]) => (req: Request, res: Response) => {
  if (down[key]) return res.status(503).json({ error: `Supplier ${key} is down` });
  const city = String(req.query.city ?? '').toLowerCase();
  res.json(city ? data.filter((h) => h.city === city) : data);
};

export const supplierRouter = Router();
supplierRouter.get('/supplierA/hotels', handler('A', supplierA));
supplierRouter.get('/supplierB/hotels', handler('B', supplierB));

// Simulation: POST /mock/supplier/A/down  or  /mock/supplier/B/up
supplierRouter.post('/mock/supplier/:key/:state', (req: Request, res: Response) => {
  const key = String(req.params.key).toUpperCase();
  const state = String(req.params.state);
  if ((key !== 'A' && key !== 'B') || (state !== 'down' && state !== 'up')) {
    return res.status(400).json({ error: 'use /mock/supplier/{A|B}/{down|up}' });
  }
  down[key as 'A' | 'B'] = state === 'down';
  res.json({ supplier: key, down: down[key as 'A' | 'B'] });
});

