import { createConsumer, disconnectConsumer } from '../config/kafka';
import { processTransactionMessages } from './kafkaConsumer';
import { logger } from '../utils/logger';

/**
 * Start Kafka consumer to process transactions and detect opportunities
 */
export async function startKafkaConsumer(): Promise<void> {
  try {
    const consumer = await createConsumer();
    logger.info('[Kafka Consumer] Starting transaction message processing...');

    // Start processing messages
    await processTransactionMessages(consumer);

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('[Kafka Consumer] Shutting down...');
      await disconnectConsumer(consumer);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('[Kafka Consumer] Consumer started and listening for messages');
  } catch (error) {
    logger.error('[Kafka Consumer] Failed to start consumer:', error);
    throw error;
  }
}
