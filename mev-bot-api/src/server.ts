import app from "./app";
import { config } from "./config/env";
import http from "http";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./websocket/websocketHandler";
import { broadcast } from "./websocket/websocketHandler";
import { startKafkaConsumer } from "./core/startKafkaConsumer";
import { logger } from "./utils/logger";

const PORT = config.PORT || 5000;

const server = http.createServer(app);

// Attach WebSocket server to the same HTTP server
const wss = new WebSocketServer({ server });

// Initialize WebSocket logic
setupWebSocket(wss);

setInterval(() => {
  broadcast({ time: new Date().toISOString(), message: "Hello Clients 👋" });
}, 5000);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Start Kafka consumer (processes transactions and detects opportunities)
startKafkaConsumer().catch((error) => {
  logger.error("Failed to start Kafka consumer:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Shutting down server...");
  wss.close();
  server.close(() => process.exit(0));
});
