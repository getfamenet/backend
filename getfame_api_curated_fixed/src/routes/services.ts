import { Router } from 'express';
import { z } from 'zod';
import { TTLCache } from '../utils/cache.js';
import { fetchServices, type Service as JAPService } from '../jap.js';
import { loadCatalog, mapCuratedToOutput } from '../catalog.js';
import { ENV } from '../env.js';

const router = Router();
const cache = new TTLCache<JAPService[]>(ENV.SERVICES_TTL_MS);

const QuerySchema = z.object({
  social: z.string().optional(),
  q: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { social, q } = QuerySchema.parse(req.query);
    const cacheKey = 'jap_services';
    let jap = cache.get(cacheKey);
    if (!jap) {
      jap = await fetchServices();
      cache.set(cacheKey, jap);
    }
    const byId = new Map(jap.map(s => [Number(s.service), s] as const));

    const catalog = loadCatalog();

    if (catalog && catalog.services.length > 0) {
      let items = catalog.services
        .filter(s => s.enabled && s.visible)
        .map(s => mapCuratedToOutput(s, byId.get(Number(s.id))))
        .filter(Boolean) as any[];

      if (social) items = items.filter(i => i.social?.toLowerCase() === String(social).toLowerCase());
      if (q) {
        const ql = String(q).toLowerCase();
        items = items.filter(i =>
          String(i.name).toLowerCase().includes(ql) ||
          String(i.category).toLowerCase().includes(ql));
      }

      items.sort((a,b) => (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name));

      return res.json({ services: items, count: items.length, curated: true });
    }

    if (ENV.CURATED_ONLY) {
      return res.json({ services: [], count: 0, curated: true });
    }

    const hay = (s: JAPService) => `${s.category} ${s.name} ${s.type}`.toLowerCase();
    const filtered = jap
      .filter(s => (!social || hay(s).includes(String(social).toLowerCase())) &&
                   (!q || hay(s).includes(String(q).toLowerCase())))
      .map(s => ({
        id: s.service, name: s.name, category: s.category, type: s.type,
        rate: Number(s.rate), min: Number(s.min), max: Number(s.max),
        refill: Boolean(s.refill), cancel: Boolean(s.cancel)
      }));

    res.json({ services: filtered, count: filtered.length, curated: false });
  } catch (err) { next(err); }
});

router.get('/raw', async (_req, res, next) => {
  try {
    const jap = await fetchServices();
    res.json(jap);
  } catch (err) { next(err); }
});

export default router;
