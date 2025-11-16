import axios from 'axios';
import { ENV } from './env.js';

const client = axios.create({
  baseURL: ENV.JAP_API_URL,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  timeout: 20000,
  validateStatus: (s) => s >= 200 && s < 500,
});

function form(data: Record<string, any>) {
  return new URLSearchParams(data).toString();
}

export type Service = {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string | number;
  min: string | number;
  max: string | number;
  refill?: boolean;
  cancel?: boolean;
  [k: string]: any;
};

export async function fetchServices() {
  const { data, status } = await client.post('', form({ key: ENV.JAP_API_KEY, action: 'services' }));
  if (status >= 400) throw new Error('JAP services request failed');
  if (!Array.isArray(data)) throw new Error('Unexpected JAP services response');
  return data as Service[];
}

export async function addOrder(payload: Record<string, any>) {
  const { data, status } = await client.post('', form({ key: ENV.JAP_API_KEY, action: 'add', ...payload }));
  if (status >= 400) throw new Error('JAP add order failed');
  return data;
}

export async function orderStatus(orderId: string | number) {
  const { data, status } = await client.post('', form({ key: ENV.JAP_API_KEY, action: 'status', order: orderId }));
  if (status >= 400) throw new Error('JAP status failed');
  return data;
}

export async function balance() {
  const { data, status } = await client.post('', form({ key: ENV.JAP_API_KEY, action: 'balance' }));
  if (status >= 400) throw new Error('JAP balance failed');
  return data;
}
