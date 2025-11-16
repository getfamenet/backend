import type { Request, Response, NextFunction } from 'express';
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500;
  const body = { error: err.message || 'Internal Server Error' };
  res.status(status).json(body);
}
