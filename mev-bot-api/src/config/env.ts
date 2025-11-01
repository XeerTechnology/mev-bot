import dotenv from "dotenv";

dotenv.config();

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000"),
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key-change-in-production",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ||
    "your-refresh-secret-key-change-in-production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || "192.168.1.24:9092",
  KAFKA_GROUO_ID: process.env.KAFKA_GROUO_ID || "mev-bot-group",
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || "mev-client",
  KAFKA_TRANSACTIONS_TOPIC:
    process.env.KAFKA_TRANSACTIONS_TOPIC || "pending-transactions",
  KAFKA_OPPORTUNITIES_TOPIC:
    process.env.KAFKA_OPPORTUNITIES_TOPIC || "detected-opportunities",
};
