// src/db.ts
// Import Prisma client from shared prisma directory at root level
// This path works for both local development and Docker builds
import { PrismaClient } from '../../../prisma/generated/prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  // log: ['query', 'info', 'warn', 'error'],
});

// Optional: log when connected (dev only)
prisma.$connect().then(() => {
  logger.info('[DB] Connected to PostgreSQL');
});

process.on('beforeExit', async () => {
  logger.info('[DB] Closing Prisma connection...');
  await prisma.$disconnect();
  logger.info('[DB] Prisma connection closed');
});
