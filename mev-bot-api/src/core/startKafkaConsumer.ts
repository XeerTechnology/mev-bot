import { config } from "../config/env";
import { createConsumer, disconnectConsumer } from "../config/kafka";
import { logger } from "../utils/logger";
import { broadcast } from "../websocket/websocketHandler";

/**
 * Start Kafka consumer to process transactions and detect opportunities
 */
export async function startKafkaConsumer(): Promise<void> {
  try {
    const consumer = await createConsumer();

    await consumer.subscribe({
      topic: config.KAFKA_TRANSACTIONS_TOPIC,
      fromBeginning: false,
    });

    consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (message.value) {
          const data = JSON.parse(message.value.toString());
          broadcast(data);
        }
      },
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info("[Kafka Consumer] Shutting down...");
      await disconnectConsumer(consumer);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    logger.info("[Kafka Consumer] Consumer started and listening for messages");
  } catch (error) {
    logger.error("[Kafka Consumer] Failed to start consumer:", error);
    throw error;
  }
}
