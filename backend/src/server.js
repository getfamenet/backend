import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4001;
const JAP_URL = process.env.JAP_API_URL || 'https://justanotherpanel.com/api/v2';
const JAP_KEY = process.env.JAP_API_KEY || '';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-this';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// LowDB v7 with defaultData
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const defaultData = { orders: [], packages: [] };
const db = new Low({ adapter, defaultData });
await db.read();
if (!db.data) db.data = defaultData;
await db.write();

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/packages', async (_req, res) => {
  await db.read();
  res.json({ packages: db.data.packages || [] });
});

app.post('/api/quote', async (req, res) => {
  const { id, quantity } = req.body || {};
  await db.read();
  const p = (db.data.packages || []).find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'Package not found' });
  const qty = Math.max(p.min, Math.min(p.max, Number(quantity || 0)));
  const price = (p.sell_per_1k * qty) / 1000;
  res.json({ id, quantity: qty, price: Number(price.toFixed(2)) });
});

app.post('/api/order', async (req, res) => {
  const { id, link, quantity, email } = req.body || {};
  await db.read();
  const p = (db.data.packages || []).find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'Package not found' });
  const qty = Math.max(p.min, Math.min(p.max, Number(quantity || 0)));
  if (!JAP_KEY) return res.status(400).json({ error: 'JAP key not configured' });

  try {
    const form = new URLSearchParams();
    form.set('key', JAP_KEY);
    form.set('action', 'add');
    form.set('service', String(p.sku));
    form.set('link', String(link || ''));
    form.set('quantity', String(qty));

    const r = await fetch(JAP_URL, { method: 'POST', body: form });
    const data = await r.json();
    if (!data || !data.order) {
      return res.status(502).json({ error: 'JAP add order failed', detail: data });
    }

    const token = nanoid(24);
    db.data.orders.push({
      token,
      email: email || null,
      createdAt: Date.now(),
      packageId: p.id,
      japOrderId: data.order,
      quantity: qty,
      link
    });
    await db.write();
    res.json({ ok: true, token, orderId: data.order });
  } catch (e) {
    res.status(500).json({ error: 'Order create error', detail: e.message });
  }
});

app.get('/api/track/:token', async (req, res) => {
  const { token } = req.params;
  await db.read();
  const o = (db.data.orders || []).find(x => x.token === token);
  if (!o) return res.status(404).json({ error: 'Not found' });
  try {
    const form = new URLSearchParams();
    form.set('key', JAP_KEY);
    form.set('action', 'status');
    form.set('order', String(o.japOrderId));
    const r = await fetch(JAP_URL, { method: 'POST', body: form });
    const s = await r.json();
    res.json({ ok: true, status: s || {} });
  } catch (e) {
    res.status(500).json({ error: 'Track error', detail: e.message });
  }
});

// Admin (Basic Auth)
app.get('/admin', (req, res) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Basic ') ? hdr.slice(6) : '';
  const decoded = Buffer.from(token, 'base64').toString('utf8');
  const [u, p] = decoded.split(':');
  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="GetFame Admin"');
    return res.status(401).send('Auth required');
  }
  res.type('html').send('<h2 style="font-family:system-ui">GetFame Admin</h2><p>PUT /api/admin/packages</p>');
});

app.put('/api/admin/packages', async (req, res) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Basic ') ? hdr.slice(6) : '';
  const [u, p] = Buffer.from(token, 'base64').toString('utf8').split(':');
  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="GetFame Admin"');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { packages } = req.body || {};
  if (!Array.isArray(packages)) return res.status(400).json({ error: 'packages[] required' });
  await db.read();
  db.data.packages = packages;
  await db.write();
  res.json({ ok: true, count: packages.length });
});

app.listen(PORT, () => console.log(`GetFame backend on :${PORT}`));
