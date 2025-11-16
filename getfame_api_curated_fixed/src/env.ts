import 'dotenv/config';
const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};
export const ENV = {
  PORT: Number(process.env.PORT || 8080),
  NODE_ENV: process.env.NODE_ENV || 'production',
  JAP_API_URL: process.env.JAP_API_URL || 'https://justanotherpanel.com/api/v2',
  JAP_API_KEY: required('JAP_API_KEY'),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*').split(',').map(s=>s.trim()).filter(Boolean),
  SERVICES_TTL_MS: Number(process.env.SERVICES_TTL_MS || 10 * 60 * 1000),
  ORDER_KEY: process.env.ORDER_KEY,
  PRICE_MULTIPLIER: Number(process.env.PRICE_MULTIPLIER || 1.0),
  CATALOG_PATH: process.env.CATALOG_PATH || './catalog.json',
  CURATED_ONLY: String(process.env.CURATED_ONLY || 'true').toLowerCase() === 'true',
} as const;
