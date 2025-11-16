import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ENV } from './env.js';
import type { Service as JAPService } from './jap.js';

const CuratedServiceSchema = z.object({
  id: z.number(),
  social: z.string(),
  name: z.string(),
  category: z.string(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  order: z.number().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  markup: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  fields: z.array(z.string()).optional(),
});

const CatalogSchema = z.object({
  services: z.array(CuratedServiceSchema).default([]),
});

export type CuratedService = z.infer<typeof CuratedServiceSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

export function loadCatalog(): Catalog | null {
  try {
    const filePath = path.resolve(ENV.CATALOG_PATH);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = CatalogSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (e) {
    console.error('Failed to load catalog:', e);
    return null;
  }
}

export function mapCuratedToOutput(curated: CuratedService, jap: JAPService | undefined) {
  if (!jap) return null;
  const baseRate = Number(jap.rate);
  const rate = typeof curated.price === 'number'
    ? curated.price
    : +(baseRate * (curated.markup ?? ENV.PRICE_MULTIPLIER)).toFixed(4);
  return {
    id: curated.id,
    name: curated.name || jap.name,
    category: curated.category || jap.category,
    type: jap.type,
    rate,
    min: curated.min ?? Number(jap.min),
    max: curated.max ?? Number(jap.max),
    refill: Boolean(jap.refill),
    cancel: Boolean(jap.cancel),
    social: curated.social,
    description: curated.description,
  };
}
