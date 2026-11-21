export const TASK_QUEUE = 'hotel-offers';
export const SUPPLIER_BASE_URL = process.env.SUPPLIER_BASE_URL ?? 'http://localhost:3000';
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';