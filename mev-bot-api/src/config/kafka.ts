import { Kafka, KafkaConfig, Producer, Consumer } from "kafkajs";
import { config } from "../config/env";
import { logger } from "../utils/logger";

// Re-export types for use in other modules
export type { Producer, Consumer };

// Kafka client configuration
const kafkaConfig: KafkaConfig = {
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS.split(","),
  retry: {
    retries: 8,
    initialRetryTime: 100,
    maxRetryTime: 30000,
    multiplier: 2,
  },
};

// Create Kafka instance
export const kafka = new Kafka(kafkaConfig);

// Create and configure producer
export const createProducer = async (): Promise<Producer> => {
  const producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
  });

  await producer.connect();
  logger.info("[Kafka] Producer connected");
  return producer;
};

// Create and configure consumer
export const createConsumer = async (): Promise<Consumer> => {
  const consumer = kafka.consumer({
    groupId: config.KAFKA_GROUO_ID,
    allowAutoTopicCreation: true,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  logger.info("[Kafka] Consumer connected");
  return consumer;
};

// Shutdown handlers
export const disconnectProducer = async (producer: Producer) => {
  await producer.disconnect();
  logger.info("[Kafka] Producer disconnected");
};

export const disconnectConsumer = async (consumer: Consumer) => {
  await consumer.disconnect();
  logger.info("[Kafka] Consumer disconnected");
};
