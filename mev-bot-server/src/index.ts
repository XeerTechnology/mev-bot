import { logger } from './utils/logger';
import { prisma } from './config/db';
import { listenMempool } from './core/mempool';
import { startKafkaConsumer } from './core/startKafkaConsumer';
import { provider } from './utils/provider';
import { decodeUniversalRouterFull } from './decoder/universalRouterDecoder';
import { decodeV3RouterTx } from './decoder/v3RouterDecoder';
import { decodeV2RouterTx } from './decoder/v2RouterDecoder';
import { getPools } from './utils/getPools';
import { getV3PriceImpact } from './services/getV3PriceImpact';
import { startCleanupTask } from './services/cleanupExpiredTxs';

// Start Kafka consumer (processes transactions and detects opportunities)
startKafkaConsumer().catch((error) => {
  logger.error('Failed to start Kafka consumer:', error);
  process.exit(1);
});

// Start mempool listener (sends transactions to Kafka)
listenMempool().catch((error) => {
  logger.error('Failed to start mempool listener:', error);
  process.exit(1);
});

// Start hourly cleanup task for expired transactions
startCleanupTask();

// Test transaction processing (commented out)
// (async () => {
//   const rpcProvider = provider();
//   const tx = await rpcProvider.getTransaction(
//     '0x461e0cf151e4745ec12439091a5ef3a0a6841e9c2d4451b1259063521884039c',
//   );
//   logger.info(tx);
//   if (!tx) return;
//   const decoded = decodeUniversalRouterFull(tx);
//   console.log('decoded', decoded);
//   if (decoded) {
//     for (const transaction of decoded) {
//       logger.info(`transaction: ${JSON.stringify(transaction)}`);
//       if (transaction.routerType === 'v3') {
//         const pool = await getPools(
//           transaction.tokenIn,
//           transaction.tokenOut,
//           '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
//           transaction.routerType,
//           transaction.fee,
//         );
//         console.log('pool', pool);
//         if (pool) {
//           const priceImpact = await getV3PriceImpact(
//             pool.poolAddress,
//             transaction.tokenIn,
//             transaction.tokenOut,
//             transaction.fee ?? '0',
//             transaction.amountIn,
//             rpcProvider as any,
//           );
//           console.log('priceImpact', priceImpact);
//         }
//       }
//     }
//   }
// })();

const shutdown = async (signal: string) => {
  logger.info(`[Shutdown] Received ${signal}, closing gracefully...`);

  try {
    logger.info('[Shutdown] Attempting Prisma disconnect...');
    await prisma.$disconnect(); // This is the line that might be hanging
    logger.info('[Shutdown] Prisma disconnected successfully.');
  } catch (err) {
    logger.error('[Shutdown] Error during graceful shutdown', err);
  } finally {
    process.exit(0); // ensures full exit
  }
};

process.on('SIGINT', () => shutdown('SIGINT')); // e.g., Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // e.g., Docker stop
