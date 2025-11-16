import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { ENV } from './env.js';
import { publicLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/error.js';
import servicesRouter from './routes/services.js';
import ordersRouter from './routes/orders.js';
import { balance } from './jap.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || ENV.ALLOWED_ORIGINS.includes('*') || ENV.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(morgan('tiny'));
app.use(publicLimiter);

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/v1/balance', async (_req, res, next) => {
  try { res.json(await balance()); } catch (err) { next(err); }
});
app.use('/v1/services', servicesRouter);
app.use('/v1/orders', ordersRouter);

app.use(errorHandler);
const port = ENV.PORT;
app.listen(port, () => console.log(`getfame-api listening on :${port}`));
