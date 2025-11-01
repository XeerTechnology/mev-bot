// src/db.ts
import { PrismaClient } from "../../../prisma/generated/prisma/client";

// Simple logger to avoid circular imports
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
};

export const prisma = new PrismaClient({
  // log: ['query', 'info', 'warn', 'error'],
});

// Optional: log when connected (dev only)
prisma.$connect().then(() => {
  logger.info("[DB] Connected to PostgreSQL");
});

process.on("beforeExit", async () => {
  logger.info("[DB] Closing Prisma connection...");
  await prisma.$disconnect();
  logger.info("[DB] Prisma connection closed");
});
