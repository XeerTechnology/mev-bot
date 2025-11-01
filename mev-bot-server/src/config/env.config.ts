// src/config.ts
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Load .env from project root
loadEnv({ path: `${process.cwd()}/.env` });

// Define schema
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .transform((val) => Number(val))
    .refine((n) => !Number.isNaN(n) && n > 0, {
      message: 'PORT must be positive',
    })
    .default(3000),
  HOST: z.string().default('http://localhost'),
  HTTP_RPC_URL: z
    .string()
    .min(1)
    .transform((val) => val.split(',').map((url) => url.trim()))
    .refine((urls) => urls.length > 0 && urls.every((url) => url.length > 0), {
      message: 'HTTP_RPC_URL must contain at least one valid URL',
    }), // Support comma-separated RPC URLs
  WSS_RPC_URL: z.string().min(1),
  UNIVERSAL_ROUTER: z.string(),
  CHAIN_ID: z
    .string()
    .default('1') // Default to Ethereum mainnet (chainId 1)
    .transform((val) => Number(val))
    .refine((n) => !Number.isNaN(n) && n > 0, {
      message: 'CHAIN_ID must be a positive number',
    }),
  KAFKA_BROKERS: z.string().min(1).default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('mev-bot'),
  KAFKA_GROUP_ID: z.string().default('mev-bot-group'),
  KAFKA_TRANSACTIONS_TOPIC: z.string().default('pending-transactions'),
  KAFKA_OPPORTUNITIES_TOPIC: z.string().default('detected-opportunities'),
});

// Validate
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  logger.error('❌ Invalid environment variables:', _env.error.format());
  console.error('process.env snapshot:', process.env);
  process.exit(1);
}

// Export clean config
export const config = {
  env: _env.data.NODE_ENV,
  port: _env.data.PORT,
  host: _env.data.HOST,
  httpRpcUrls: _env.data.HTTP_RPC_URL, // Array of RPC URLs
  httpRpcUrl: _env.data.HTTP_RPC_URL[0], // Primary RPC URL for backward compatibility
  wssRpcUrl: _env.data.WSS_RPC_URL,
  universalRouter: _env.data.UNIVERSAL_ROUTER,
  chainId: _env.data.CHAIN_ID, // Chain ID (e.g., 1 for Ethereum, 137 for Polygon)
  kafka: {
    brokers: _env.data.KAFKA_BROKERS.split(','),
    clientId: _env.data.KAFKA_CLIENT_ID,
    groupId: _env.data.KAFKA_GROUP_ID,
    topics: {
      transactions: _env.data.KAFKA_TRANSACTIONS_TOPIC,
      opportunities: _env.data.KAFKA_OPPORTUNITIES_TOPIC,
    },
  },
};
