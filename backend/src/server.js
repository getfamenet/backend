import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';

// ---- paths / env ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4001;
const SITE_URL = process.env.SITE_URL || '*'; // e.g. https://getfame.net or http://localhost:3001
const JAP_URL = process.env.JAP_API_URL || 'https://justanotherpanel.com/api/v2';
const JAP_KEY = process.env.JAP_API_KEY || '';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-this';

// allow persistent disk if provided
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.json');

// ---- express ----
const app = express();
app.use(cors({ origin: SITE_URL === '*' ? true : [SITE_URL] }));
app.use(express.json());
app.use(morgan('tiny'));

// ---- lowdb safe init & seed ----
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const adapter = new JSONFile(DB_FILE);

// your three products, cost and public selling price per 1k
const seededPackages = [
  {
    id: 'ig_followers_5951',
    platform: 'instagram',
    type: 'followers',
    title: 'IG Followers — Premium (USA/EU)',
    sku: 5951,
    cost_per_1k: 5.23,
    sell_per_1k: 19.99,            // you can change via admin
    min: 50,
    max: 100000,
    tags: ['Popular', 'Best Value'],
    active: true
  },
  {
    id: 'ig_likes_6073',
    platform: 'instagram',
    type: 'likes',
    title: 'IG Likes — RAL™ (No-Drop)',
    sku: 6073,
    cost_per_1k: 13.72,
    sell_per_1k: 34.99,
    min: 50,
    max: 5000,
    tags: ['Bestseller'],
    active: true
  },
  {
    id: 'tt_views_3365',
    platform: 'tiktok',
    type: 'views',
    title: 'TikTok Views — Exclusive (30-day Refill)',
    sku: 3365,
    cost_per_1k: 0.08,
    sell_per_1k: 1.29,
    min: 100,
    max: 100000000,
    tags: ['Ultra Fast'],
    active: true
  }
];

const defaultData = { orders: [], packages: seededPackages, meta: { seededAt: new Date().toISOString() } };
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
if (!Array.isArray(db.data.packages) || db.data.packages.length === 0) {
  db.data.packages = seededPackages;
}
await db.write();

// ---- helpers ----
function clamp(n, lo, hi) {
  const val = Number(n);
  if (Number.isNaN(val)) return lo;
  return Math.max(lo, Math.min(hi, val));
}

function authOk(req) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Basic ')) return false;
  const [u, p] = Buffer.from(hdr.slice(6), 'base64').toString('utf8').split(':');
  return u === ADMIN_USER && p === ADMIN_PASS;
}

async function jap(formObj) {
  const body = new URLSearchParams(formObj);
  const r = await fetch(JAP_URL, { method: 'POST', body });
  if (!r.ok) throw new Error(`JAP HTTP ${r.status}`);
  const json = await r.json();
  if (json?.error) throw new Error(`JAP: ${json.error}`);
  return json;
}

function quote(pkg, qty) {
  // flat per-1k model
  const blocks = qty / 1000;
  return Number((pkg.sell_per_1k * blocks).toFixed(2));
}

// ---- routes ----
app.get('/api/health', (_req, res) => res.json({ ok: true, now: Date.now() }));

app.get('/api/packages', async (req, res) => {
  await db.read();
  const { platform } = req.query;
  let pkgs = (db.data.packages || []).filter(p => p.active);
  if (platform) pkgs = pkgs.filter(p => p.platform === String(platform));
  res.json({ packages: pkgs });
});

app.post('/api/quote', async (req, res) => {
  const { id, quantity } = req.body || {};
  await db.read();
  const p = (db.data.packages || []).find(x => x.id === id && x.active);
  if (!p) return res.status(404).json({ error: 'Package not found' });
  const qty = clamp(quantity, p.min, p.max);
  return res.json({ id, quantity: qty, price: quote(p, qty) });
});

// Create order -> JAP
app.post('/api/order', async (req, res) => {
  const { id, link, quantity, email } = req.body || {};
  await db.read();
  const p = (db.data.packages || []).find(x => x.id === id && x.active);
  if (!p) return res.status(404).json({ error: 'Package not found' });
  const qty = clamp(quantity, p.min, p.max);
  if (!JAP_KEY) return res.status(500).json({ error: 'JAP key not configured' });
  if (!link) return res.status(400).json({ error: 'link/handle required' });

  try {
    const created = await jap({
      key: JAP_KEY,
      action: 'add',
      service: String(p.sku),
      link: String(link),
      quantity: String(qty)
    });

    const token = nanoid(24);
    const order = {
      token,
      email: email || null,
      createdAt: Date.now(),
      packageId: p.id,
      japOrderId: created.order,
      quantity: qty,
      link,
      price_usd: quote(p, qty),
      status: 'processing'
    };
    db.data.orders.push(order);
    await db.write();

    res.json({ ok: true, token, orderId: created.order, amount: order.price_usd });
  } catch (e) {
    console.error('Order error:', e.message);
    res.status(502).json({ error: 'Upstream order failed' });
  }
});

// Track status (private): token + optional email match
app.post('/api/track/:token', async (req, res) => {
  const { token } = req.params;
  const email = req.body?.email;
  await db.read();
  const o = (db.data.orders || []).find(x => x.token === token);
  if (!o) return res.status(404).json({ error: 'Not found' });
  if (o.email && email && o.email !== email) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!JAP_KEY) return res.status(500).json({ error: 'JAP key not configured' });

  try {
    const status = await jap({
      key: JAP_KEY,
      action: 'status',
      order: String(o.japOrderId)
    });

    // store a few fields for history
    o.status = status.status || o.status;
    o.remains = status.remains ?? o.remains;
    o.charge = status.charge ?? o.charge;
    o.start_count = status.start_count ?? o.start_count;
    await db.write();

    res.json({ ok: true, status });
  } catch (e) {
    console.error('Track error:', e.message);
    res.status(502).json({ error: 'Upstream status failed' });
  }
});

// ---- Admin (Basic Auth) ----
app.get('/admin', (req, res) => {
  if (!authOk(req)) {
    res.set('WWW-Authenticate', 'Basic realm="GetFame Admin"');
    return res.status(401).send('Auth required');
  }
  res.type('html').send(
    '<h2 style="font-family:system-ui">GetFame Admin</h2><p>PUT /api/admin/packages (Basic Auth)</p>'
  );
});

// Upsert full packages array
app.put('/api/admin/packages', async (req, res) => {
  if (!authOk(req)) {
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

app.listen(PORT, () => console.log(`GetFame backend listening on :${PORT}`));
