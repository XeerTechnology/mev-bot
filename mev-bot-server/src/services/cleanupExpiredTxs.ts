import { prisma } from '../config/db';
import { logger } from '../utils/logger';

/**
 * Remove expired, pending, and detected but expired transactions from the database
 * This should be run periodically (e.g., every hour)
 */
export async function cleanupExpiredTxs(): Promise<void> {
  try {
    const now = Date.now();

    // Remove transactions with status 'expired'
    const expiredResult = await prisma.opportunity.deleteMany({
      where: {
        status: 'expired',
      },
    });

    // Remove transactions with status 'pending'
    const pendingResult = await prisma.opportunity.deleteMany({
      where: {
        status: 'pending',
      },
    });

    // Remove detected transactions that are expired
    // First, delete transactions with isExpired flag set to true (more reliable with Prisma JSON filtering)
    const expiredByFlagResult = await prisma.opportunity.deleteMany({
      where: {
        status: 'detected',
        metadata: {
          path: ['isExpired'],
          equals: true,
        },
      },
    });

    // Then, fetch remaining detected transactions to check deadlineTimestamp
    // (Prisma JSON numeric comparison is unreliable, so we check in memory)
    const detectedTxs = await prisma.opportunity.findMany({
      where: {
        status: 'detected',
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    // Filter transactions where deadlineTimestamp has passed
    const expiredByDeadlineIds: string[] = [];
    for (const tx of detectedTxs) {
      const metadata = tx.metadata as any;
      if (metadata?.deadlineTimestamp) {
        const deadlineTimestamp =
          typeof metadata.deadlineTimestamp === 'number'
            ? metadata.deadlineTimestamp
            : parseInt(metadata.deadlineTimestamp);
        if (!isNaN(deadlineTimestamp) && deadlineTimestamp < now) {
          expiredByDeadlineIds.push(tx.id);
        }
      }
    }

    // Delete expired detected transactions by deadline
    let expiredByDeadlineResult = { count: 0 };
    if (expiredByDeadlineIds.length > 0) {
      expiredByDeadlineResult = await prisma.opportunity.deleteMany({
        where: {
          id: {
            in: expiredByDeadlineIds,
          },
        },
      });
    }

    const expiredDetectedResult = {
      count: expiredByFlagResult.count + expiredByDeadlineResult.count,
    };

    const totalRemoved =
      expiredResult.count + pendingResult.count + expiredDetectedResult.count;

    if (totalRemoved > 0) {
      logger.info(
        `[Cleanup] Removed ${totalRemoved} transaction(s) from database: ` +
          `${expiredResult.count} expired, ${pendingResult.count} pending, ` +
          `${expiredDetectedResult.count} detected but expired`,
      );
    } else {
      logger.debug('[Cleanup] No transactions to remove');
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          )
        : String(error);
    logger.error(`[Cleanup] Error removing transactions: ${errorMessage}`);
  }
}

/**
 * Start the cleanup task that runs every hour
 */
export function startCleanupTask(): void {
  const HOUR_IN_MS = 60 * 60 * 1000; // 1 hour in milliseconds

  // Run immediately on startup
  cleanupExpiredTxs().catch((error) => {
    logger.error('[Cleanup] Error in initial cleanup:', error);
  });

  // Then run every hour
  setInterval(() => {
    cleanupExpiredTxs().catch((error) => {
      logger.error('[Cleanup] Error in scheduled cleanup:', error);
    });
  }, HOUR_IN_MS);

  logger.info(
    '[Cleanup] Started hourly cleanup task for expired, pending, and detected-but-expired transactions',
  );
}
