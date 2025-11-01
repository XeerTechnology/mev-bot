import { WebSocketServer, WebSocket } from "ws";

// Track connected clients
const clients = new Set<WebSocket>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    console.log("🔌 Client connected");

    ws.on("message", (data: string) => {
      console.log("📩 Message from client:", data);
      // You can handle incoming messages if needed
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log("❌ Client disconnected");
    });
  });

  console.log("⚡ WebSocket server initialized");
}

export function broadcast<T>(message: T): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
