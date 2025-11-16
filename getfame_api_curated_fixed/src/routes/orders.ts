import { Router } from 'express';
import { z } from 'zod';
import { addOrder, orderStatus } from '../jap.js';
import { loadCatalog } from '../catalog.js';
import { ENV } from '../env.js';

const router = Router();

const CreateOrderSchema = z.object({
  service: z.union([z.number(), z.string().regex(/^\d+$/)]),
  link: z.string().url(),
  quantity: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  comments: z.string().optional(),
  usernames: z.string().optional(),
  hashtag: z.string().optional(),
  media: z.string().optional(),
  min: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  max: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  runs: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  interval: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    if (ENV.ORDER_KEY) {
      const key = req.header('x-order-key');
      if (key !== ENV.ORDER_KEY) return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = CreateOrderSchema.parse(req.body);
    const serviceId = Number(body.service);

    const catalog = loadCatalog();
    if (catalog && catalog.services.length > 0) {
      const entry = catalog.services.find(s => Number(s.id) === serviceId && s.enabled);
      if (!entry) return res.status(400).json({ error: 'Service is not enabled or not allowed' });
      const qty = Number(body.quantity ?? 0);
      if (entry.min && qty && qty < entry.min) return res.status(400).json({ error: `Minimum quantity is ${entry.min}` });
      if (entry.max && qty && qty > entry.max) return res.status(400).json({ error: `Maximum quantity is ${entry.max}` });
    }

    const response = await addOrder(body as any);
    res.status(201).json(response);
  } catch (err) { next(err); }
});

router.get('/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const response = await orderStatus(orderId);
    res.json(response);
  } catch (err) { next(err); }
});

export default router;
