import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface Merchant {
  merchantId: string;   // "mer_abc123"
  name: string;
  wallet: string;       // "0x..."
  createdAt: number;
}
