// src/logger.ts
import winston from "winston";
import LokiTransport from "winston-loki";

// Console transport (optional, for local debugging)
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
});

// Loki transport
const lokiTransport = new LokiTransport({
  host: `http://localhost`, // change to your Loki URL
  labels: { job: "mev-bot-logger" },
  json: true,
  interval: 5, // how often to batch/send logs (in seconds)
  replaceTimestamp: true,
});

export const logger = winston.createLogger({
  level: "info",
  transports: [consoleTransport, lokiTransport],
});
